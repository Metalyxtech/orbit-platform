import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { salesCustomers, salesInvoices, salesOrders, salesPayments, type Tx } from '@orbit/db';
import { fmtMoney, orderLabel, type OrderStatus } from '../config';
import { addDays, hasRole, loadConfig, myRole, nextNumber, peopleById, requireRole, today } from './shared';

// Sales orders (from won enquiries), GST invoices and payments received.

async function lockOrder(tx: Tx, ctx: SessionContext, id: string) {
  const [o] = await tx.select().from(salesOrders).where(eq(salesOrders.id, z.uuid().parse(id))).for('update');
  if (!o || o.companyId !== ctx.companyId) throw new Error('Order not found');
  return o;
}
const note = (tx: Tx, ctx: ActionContext, id: string, action: string, line: string) =>
  audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action, entity: 'sales_orders', entityId: id, data: { summary: [line] }, requestId: ctx.requestId });

export async function listOrders(tx: Tx, ctx: SessionContext) {
  const me = await myRole(tx, ctx);
  const conds = [eq(salesOrders.companyId, ctx.companyId)];
  if (me === 'exec') conds.push(eq(salesOrders.ownerId, ctx.membershipId));
  const rows = await tx.select({ o: salesOrders, customer: salesCustomers.name }).from(salesOrders).innerJoin(salesCustomers, eq(salesCustomers.id, salesOrders.customerId)).where(and(...conds)).orderBy(desc(salesOrders.createdAt)).limit(500);
  const people = await peopleById(tx, rows.map((r) => r.o.ownerId));
  return {
    me,
    can: { confirm: hasRole(me, 'manager', 'gm'), advance: hasRole(me, 'manager'), invoice: hasRole(me, 'accounts') },
    rows: rows.map(({ o, customer }) => ({ ...o, customer, owner: o.ownerId ? (people.get(o.ownerId) ?? '') : '', statusLabel: orderLabel(o.status), createdAt: o.createdAt.toISOString() })),
  };
}
export type OrderRow = Awaited<ReturnType<typeof listOrders>>['rows'][number];

export async function confirmOrder(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  requireRole(await myRole(tx, ctx), 'manager', 'gm');
  const o = await lockOrder(tx, ctx, raw.id);
  if (o.status !== 'awaiting') throw new Error('This order is already confirmed');
  await tx.update(salesOrders).set({ status: 'confirmed' }).where(eq(salesOrders.id, o.id));
  await note(tx, ctx, o.id, 'sales.order.confirm', `${o.number} confirmed`);
  return { ok: true as const };
}

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { confirmed: 'production', production: 'dispatched' };

/** Confirmed → in production → dispatched. */
export async function advanceOrder(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  requireRole(await myRole(tx, ctx), 'manager');
  const o = await lockOrder(tx, ctx, raw.id);
  const next = NEXT[o.status as OrderStatus];
  if (!next) throw new Error('Nothing to move forward on this order');
  await tx.update(salesOrders).set({ status: next }).where(eq(salesOrders.id, o.id));
  await note(tx, ctx, o.id, 'sales.order.status', `${o.number}: ${orderLabel(next)}`);
  return { status: next };
}

/** Accounts raises the GST invoice for a confirmed order; the advance counts as already paid. */
export async function raiseInvoice(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  requireRole(await myRole(tx, ctx), 'accounts');
  const o = await lockOrder(tx, ctx, raw.id);
  if (!['confirmed', 'production', 'dispatched'].includes(o.status)) throw new Error('Confirm the order before invoicing');
  const cfg = await loadConfig(tx, ctx.companyId);
  const number = await nextNumber(tx, ctx.companyId, 'inv');
  const amount = Math.round(o.value * (1 + cfg.gst / 100) * 100) / 100;
  const advance = Math.round(((amount * o.advancePct) / 100) * 100) / 100;
  const issued = today();
  const [inv] = await tx.insert(salesInvoices).values({ companyId: ctx.companyId, number, orderId: o.id, customerId: o.customerId, amount, paid: advance, issued, due: addDays(issued, cfg.paymentTermsDays) }).returning({ id: salesInvoices.id });
  if (advance > 0) await tx.insert(salesPayments).values({ companyId: ctx.companyId, invoiceId: inv.id, amount: advance, reference: `Advance ${o.advancePct}% with order`, byId: ctx.membershipId });
  await tx.update(salesOrders).set({ status: 'invoiced' }).where(eq(salesOrders.id, o.id));
  await note(tx, ctx, o.id, 'sales.invoice.raise', `${number} raised for ${o.number}: ${fmtMoney(cfg.currency, amount)} incl. GST`);
  return { number };
}

export async function listInvoices(tx: Tx, ctx: SessionContext) {
  const me = await myRole(tx, ctx);
  requireRole(me, 'accounts', 'manager', 'gm');
  const rows = await tx
    .select({ i: salesInvoices, customer: salesCustomers.name, order: salesOrders.number })
    .from(salesInvoices)
    .innerJoin(salesCustomers, eq(salesCustomers.id, salesInvoices.customerId))
    .leftJoin(salesOrders, eq(salesOrders.id, salesInvoices.orderId))
    .where(eq(salesInvoices.companyId, ctx.companyId))
    .orderBy(desc(salesInvoices.issued))
    .limit(500);
  const t0 = today();
  const day = 86_400_000;
  const list = rows.map(({ i, customer, order }) => {
    const due = i.amount - i.paid;
    const overdueDays = due > 0.5 && i.due < t0 ? Math.round((Date.parse(t0) - Date.parse(i.due)) / day) : 0;
    return { ...i, customer, order, balance: due, overdueDays, createdAt: i.createdAt.toISOString() };
  });
  const ageing = { current: 0, d30: 0, d60: 0, d90: 0 };
  for (const i of list) {
    if (i.balance <= 0.5) continue;
    if (!i.overdueDays) ageing.current += i.balance;
    else if (i.overdueDays <= 30) ageing.d30 += i.balance;
    else if (i.overdueDays <= 60) ageing.d60 += i.balance;
    else ageing.d90 += i.balance;
  }
  return { me, canRecord: hasRole(me, 'accounts'), rows: list, ageing };
}
export type InvoiceRow = Awaited<ReturnType<typeof listInvoices>>['rows'][number];

const payInput = z.object({ id: z.uuid(), amount: z.number().positive().max(1e12), reference: z.string().trim().max(120).optional() });

export async function recordPayment(tx: Tx, ctx: ActionContext, raw: z.input<typeof payInput>) {
  requireRole(await myRole(tx, ctx), 'accounts');
  const v = payInput.parse(raw);
  const [i] = await tx.select().from(salesInvoices).where(eq(salesInvoices.id, v.id)).for('update');
  if (!i || i.companyId !== ctx.companyId) throw new Error('Invoice not found');
  const balance = Math.round((i.amount - i.paid) * 100) / 100;
  if (v.amount > balance + 0.5) throw new Error(`Only ${balance.toLocaleString('en-IN')} is still due on this invoice`);
  await tx.insert(salesPayments).values({ companyId: ctx.companyId, invoiceId: i.id, amount: v.amount, reference: v.reference || null, byId: ctx.membershipId });
  await tx.update(salesInvoices).set({ paid: sql`${salesInvoices.paid} + ${v.amount}` }).where(eq(salesInvoices.id, i.id));
  const cfg = await loadConfig(tx, ctx.companyId);
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'sales.payment', entity: 'sales_invoices', entityId: i.id, data: { summary: [`${fmtMoney(cfg.currency, v.amount)} received on ${i.number}${v.reference ? ` (${v.reference})` : ''}`] }, requestId: ctx.requestId });
  return { ok: true as const };
}
