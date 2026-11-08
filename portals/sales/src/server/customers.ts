import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { salesCustomers, salesEnquiries, salesInvoices, type Tx } from '@orbit/db';
import { OPEN_STAGES } from '../config';
import { myRole, requireRole } from './shared';

export const customerInput = z.object({
  name: z.string().trim().min(2, 'Enter the customer name').max(160),
  city: z.string().trim().max(80).optional(),
  gstin: z.string().trim().max(20).optional(),
  contact: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
  creditLimit: z.number().min(0).max(1e12).nullable().optional(),
  terms: z.string().trim().max(60).optional(),
});

/** Adds a customer (or returns the existing one with the same name). */
export async function addCustomer(tx: Tx, ctx: ActionContext, raw: z.input<typeof customerInput>) {
  requireRole(await myRole(tx, ctx), 'exec', 'manager', 'accounts');
  const v = customerInput.parse(raw);
  const [found] = await tx.select({ id: salesCustomers.id }).from(salesCustomers).where(and(eq(salesCustomers.companyId, ctx.companyId), sql`lower(${salesCustomers.name}) = lower(${v.name})`));
  if (found) return { id: found.id };
  const [row] = await tx
    .insert(salesCustomers)
    .values({ companyId: ctx.companyId, name: v.name, city: v.city || null, gstin: v.gstin?.toUpperCase() || null, contact: v.contact || null, phone: v.phone || null, email: v.email || null, creditLimit: v.creditLimit ?? null, terms: v.terms || null })
    .returning({ id: salesCustomers.id });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'sales.customer.add', entity: 'sales_customers', entityId: row.id, data: { summary: [`Customer added: ${v.name}`] }, requestId: ctx.requestId });
  return { id: row.id };
}

/** Customers with open enquiries and what they owe. */
export async function listCustomers(tx: Tx, ctx: SessionContext) {
  const [rows, open, owed] = await Promise.all([
    tx.select().from(salesCustomers).where(eq(salesCustomers.companyId, ctx.companyId)).orderBy(asc(salesCustomers.name)),
    tx.select({ customerId: salesEnquiries.customerId, stage: salesEnquiries.stage }).from(salesEnquiries).where(eq(salesEnquiries.companyId, ctx.companyId)),
    tx.select({ customerId: salesInvoices.customerId, amount: salesInvoices.amount, paid: salesInvoices.paid }).from(salesInvoices).where(eq(salesInvoices.companyId, ctx.companyId)),
  ]);
  return rows.map((c) => ({
    ...c,
    openEnquiries: open.filter((e) => e.customerId === c.id && OPEN_STAGES.includes(e.stage as never)).length,
    outstanding: owed.filter((i) => i.customerId === c.id).reduce((n, i) => n + i.amount - i.paid, 0),
  }));
}
export type CustomerRow = Awaited<ReturnType<typeof listCustomers>>[number];
