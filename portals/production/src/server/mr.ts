import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext, SessionContext } from '@orbit/core';
import { deliverToProduction, purchaseOn, purchaseStatus, raisePurchase, type SupplyUpdate } from '@orbit/core/supply';
import { prodIssues, prodMaterials, prodMatRequests, prodReceipts, prodWorkOrders, type MrLine, type MrStatus, type Tx } from '@orbit/db';
import { fmtQty, MR_STATUS } from '../config';
import { availability, r3, stockIn, stockOut } from './stock';
import { hasRole, lockWo, logEvent, myRole, peopleById, requireRole, today } from './shared';

// Material requests (MR). The supervisor asks for material on a work order; the production store
// keeper issues what the production store has and asks for the rest. The production engineer and
// then the production manager approve; the request goes to Purchase (main store or buying). When
// the material arrives in the production store, the store keeper issues it to the work order.

type Mr = typeof prodMatRequests.$inferSelect;
const OPEN: MrStatus[] = ['store', 'engineer', 'manager', 'purchase', 'ready'];
const left = (l: MrLine) => r3(l.qty - l.issued);

async function lockMr(tx: Tx, ctx: SessionContext, id: string) {
  const [m] = await tx.select().from(prodMatRequests).where(and(eq(prodMatRequests.id, id), eq(prodMatRequests.companyId, ctx.companyId))).for('update');
  if (!m) throw new Error('Material request not found');
  return m;
}
async function save(tx: Tx, id: string, set: Partial<typeof prodMatRequests.$inferInsert>) {
  await tx.update(prodMatRequests).set({ ...set, updatedAt: new Date() }).where(eq(prodMatRequests.id, id));
}
/** The lines sent to Purchase, in the order Purchase knows them. */
const buyIndex = (lines: MrLine[]) => lines.map((l, i) => (l.toBuy > 0 ? i : -1)).filter((i) => i >= 0);

// ---------- raise ----------

const createInput = z.object({
  workOrderId: z.uuid(),
  lines: z
    .array(z.object({ materialId: z.uuid().nullable(), item: z.string().trim().min(1, 'Name every item').max(200), unit: z.string().trim().min(1).max(20), qty: z.number().positive('Enter a quantity') }))
    .min(1, 'Add at least one item')
    .max(100),
  note: z.string().trim().max(500).optional(),
});

/** The supervisor (or engineer / manager) asks the production store for material on a work order. */
export async function createMr(tx: Tx, ctx: ActionContext, raw: z.input<typeof createInput>) {
  const v = createInput.parse(raw);
  requireRole(await myRole(tx, ctx), 'supervisor', 'engineer', 'manager');
  const wo = await lockWo(tx, ctx, v.workOrderId);
  if (!['released', 'in_progress'].includes(wo.status)) throw new Error('Material is requested for a released work order');
  const mats = await tx.select().from(prodMaterials).where(eq(prodMaterials.workOrderId, wo.id));
  for (const l of v.lines) if (l.materialId && !mats.some((m) => m.id === l.materialId)) throw new Error('Material not found on this work order');
  const [{ n }] = await tx.select({ n: count() }).from(prodMatRequests).where(eq(prodMatRequests.companyId, ctx.companyId));
  const number = `MR-${String(n + 1).padStart(4, '0')}`;
  const lines: MrLine[] = v.lines.map((l) => ({ materialId: l.materialId, item: l.item, unit: l.unit, qty: l.qty, issued: 0, toBuy: 0, received: 0 }));
  const [mr] = await tx.insert(prodMatRequests).values({ companyId: ctx.companyId, number, workOrderId: wo.id, lines, note: v.note || null, requestedBy: ctx.membershipId }).returning({ id: prodMatRequests.id });
  await logEvent(tx, ctx, wo.id, `${number}: material requested from the production store (${lines.map((l) => `${l.item} ${fmtQty(l.qty)} ${l.unit}`).join(', ')})`, 'production.mr.create');
  return { id: mr.id, number };
}

// ---------- production store ----------

const issueInput = z.object({ id: z.uuid(), qty: z.array(z.number().min(0)).max(100) });

/** The store issues from the production store stock to the work order. */
export async function issueMr(tx: Tx, ctx: ActionContext, raw: z.input<typeof issueInput>) {
  const v = issueInput.parse(raw);
  requireRole(await myRole(tx, ctx), 'store', 'manager');
  const mr = await lockMr(tx, ctx, v.id);
  if (!['store', 'ready', 'purchase'].includes(mr.status)) throw new Error(`${mr.number} is ${MR_STATUS[mr.status].label.toLowerCase()}`);
  const wo = await lockWo(tx, ctx, mr.workOrderId);
  const lines = mr.lines.map((l) => ({ ...l }));
  const done: string[] = [];
  for (const [i, l] of lines.entries()) {
    const q = r3(v.qty[i] ?? 0);
    if (q <= 0) continue;
    if (q > left(l) + 1e-9) throw new Error(`${l.item}: only ${fmtQty(left(l))} ${l.unit} still to issue`);
    await stockOut(tx, ctx, { item: l.item, qty: q, unit: l.unit }, `${mr.number} / ${wo.number}`, 'Issued to work order');
    if (l.materialId) {
      const [m] = await tx.select().from(prodMaterials).where(eq(prodMaterials.id, l.materialId));
      if (m) {
        await tx.update(prodMaterials).set({ issuedQty: r3(m.issuedQty + q) }).where(eq(prodMaterials.id, m.id));
        await tx.insert(prodIssues).values({ companyId: ctx.companyId, workOrderId: wo.id, materialId: m.id, qty: q, note: mr.number, byId: ctx.membershipId });
      }
    }
    l.issued = r3(l.issued + q);
    done.push(`${l.item} ${fmtQty(q)} ${l.unit}`);
  }
  if (!done.length) throw new Error('Enter a quantity to issue');
  const all = lines.every((l) => left(l) <= 1e-9);
  const status: MrStatus = all ? 'issued' : mr.status === 'ready' && lines.every((l) => l.received >= l.toBuy - 1e-9) ? 'ready' : mr.status;
  await save(tx, mr.id, { lines, status, returnNote: all ? null : mr.returnNote });
  await logEvent(tx, ctx, wo.id, `${mr.number}: issued from the production store: ${done.join(', ')}${all ? '. Request complete.' : ''}`, 'production.mr.issue');
  return { status };
}

const askInput = z.object({ id: z.uuid(), note: z.string().trim().max(500).optional() });

/** Not enough in the production store: the store asks for the rest (engineer, then manager approve). */
export async function askPurchase(tx: Tx, ctx: ActionContext, raw: z.input<typeof askInput>) {
  const v = askInput.parse(raw);
  requireRole(await myRole(tx, ctx), 'store', 'manager');
  const mr = await lockMr(tx, ctx, v.id);
  if (mr.status !== 'store') throw new Error(`${mr.number} is ${MR_STATUS[mr.status].label.toLowerCase()}`);
  const lines = mr.lines.map((l) => ({ ...l, toBuy: left(l) }));
  if (!lines.some((l) => l.toBuy > 0)) throw new Error('Everything has been issued already');
  await save(tx, mr.id, { lines, status: 'engineer', returnNote: null, engineerId: null, engineerAt: null, managerId: null, managerAt: null });
  const [wo] = await tx.select({ id: prodWorkOrders.id }).from(prodWorkOrders).where(eq(prodWorkOrders.id, mr.workOrderId));
  await logEvent(tx, ctx, wo.id, `${mr.number}: not in the production store, sent for approval to buy ${lines.filter((l) => l.toBuy > 0).map((l) => `${l.item} ${fmtQty(l.toBuy)} ${l.unit}`).join(', ')}${v.note ? ` (${v.note})` : ''}`, 'production.mr.ask');
  return { status: 'engineer' as const };
}

// ---------- approvals ----------

const decideInput = z.object({ id: z.uuid(), approve: z.boolean(), note: z.string().trim().max(1000).optional() });

/** Production engineer, then production manager. The manager's approval sends it to Purchase. */
export async function decideMr(tx: Tx, ctx: ActionContext, raw: z.input<typeof decideInput>) {
  const v = decideInput.parse(raw);
  const me = await myRole(tx, ctx);
  const mr = await lockMr(tx, ctx, v.id);
  if (mr.status !== 'engineer' && mr.status !== 'manager') throw new Error(`${mr.number} is not waiting for approval`);
  requireRole(me, mr.status === 'engineer' ? 'engineer' : 'manager');
  const wo = await lockWo(tx, ctx, mr.workOrderId);
  const who = mr.status === 'engineer' ? 'Production engineer' : 'Production manager';
  if (!v.approve) {
    if (!v.note) throw new Error('Say why, so the store knows what to do');
    await save(tx, mr.id, { status: 'store', returnNote: `${who}: ${v.note}`, lines: mr.lines.map((l) => ({ ...l, toBuy: 0 })) });
    await logEvent(tx, ctx, wo.id, `${mr.number}: ${who.toLowerCase()} sent it back to the store: ${v.note}`, 'production.mr.reject');
    return { status: 'store' as const };
  }
  if (mr.status === 'engineer') {
    await save(tx, mr.id, { status: 'manager', engineerId: ctx.membershipId, engineerAt: new Date() });
    await logEvent(tx, ctx, wo.id, `${mr.number}: approved by the production engineer${v.note ? ` (${v.note})` : ''}`, 'production.mr.approve');
    return { status: 'manager' as const };
  }
  const idx = buyIndex(mr.lines);
  const p = await raisePurchase(tx, ctx, {
    source: 'production',
    sourceId: mr.id,
    sourceRef: mr.number,
    workOrder: wo.number,
    title: `${wo.number} ${wo.title}: material for production`.slice(0, 200),
    project: (wo.customer || wo.title).slice(0, 200),
    needBy: wo.due ?? today(),
    priority: wo.priority === 'urgent' ? 'Urgent' : 'Normal',
    note: [mr.note, v.note].filter(Boolean).join(' · ') || null,
    lines: idx.map((i) => ({ description: mr.lines[i].item, qty: mr.lines[i].toBuy, unit: mr.lines[i].unit })),
  });
  await save(tx, mr.id, { status: 'purchase', managerId: ctx.membershipId, managerAt: new Date(), purchaseId: p.id, purchaseRef: p.number });
  await logEvent(tx, ctx, wo.id, `${mr.number}: approved by the production manager and sent to Purchase as ${p.number}`, 'production.mr.approve');
  return { status: 'purchase' as const, purchase: p.number };
}

/** The person who raised it, or the manager, withdraws a request that is still open. */
export async function cancelMr(tx: Tx, ctx: ActionContext, raw: { id: string; note: string }) {
  const v = z.object({ id: z.uuid(), note: z.string().trim().min(2, 'Say why').max(500) }).parse(raw);
  const me = await myRole(tx, ctx);
  const mr = await lockMr(tx, ctx, v.id);
  if (!['store', 'engineer', 'manager'].includes(mr.status)) throw new Error('Only a request that has not gone to Purchase can be cancelled');
  if (mr.requestedBy !== ctx.membershipId && !hasRole(me, 'manager')) throw new Error('Only the person who asked, or the production manager, can cancel it');
  await save(tx, mr.id, { status: 'cancelled', returnNote: v.note });
  await logEvent(tx, ctx, mr.workOrderId, `${mr.number}: cancelled (${v.note})`, 'production.mr.cancel');
  return { ok: true as const };
}

// ---------- deliveries from Purchase ----------

const deliveryInput = z.object({
  id: z.uuid(),
  deliveryNote: z.string().trim().min(1, 'Enter the delivery note number').max(80),
  supplier: z.string().trim().max(200).optional(),
  condition: z.enum(['Good', 'Damaged', 'Short']),
  docsOk: z.boolean(),
  /** Per line sent to Purchase, in order. */
  qty: z.array(z.number().min(0)).max(100),
});

/**
 * Goods bought for this request arrived at the shop floor: the production store records the
 * delivery (it reaches Purchase's goods receipt, and QC when used). Stock is booked once accepted.
 */
export async function recordDelivery(tx: Tx, ctx: ActionContext, raw: z.input<typeof deliveryInput>) {
  const v = deliveryInput.parse(raw);
  requireRole(await myRole(tx, ctx), 'store', 'manager');
  const mr = await lockMr(tx, ctx, v.id);
  if (mr.status !== 'purchase' || !mr.purchaseId) throw new Error(`${mr.number} is not waiting for goods from Purchase`);
  const idx = buyIndex(mr.lines);
  if (v.qty.length !== idx.length || v.qty.every((q) => q <= 0)) throw new Error('Enter the quantity received');
  const res = await deliverToProduction(tx, ctx, { purchaseId: mr.purchaseId, deliveryNote: v.deliveryNote, condition: v.condition, docsOk: v.docsOk, qty: v.qty });
  const [{ n }] = await tx.select({ n: count() }).from(prodReceipts).where(eq(prodReceipts.companyId, ctx.companyId));
  const number = `GR-${String(n + 1).padStart(4, '0')}`;
  const [rc] = await tx
    .insert(prodReceipts)
    .values({
      companyId: ctx.companyId,
      number,
      mrId: mr.id,
      purchaseId: mr.purchaseId,
      reference: v.deliveryNote,
      supplier: v.supplier || null,
      lines: idx.map((i, k) => ({ item: mr.lines[i].item, qty: v.qty[k], unit: mr.lines[i].unit })).filter((l) => l.qty > 0),
      status: 'qc',
      note: `Delivery for ${res.ref}`,
      byId: ctx.membershipId,
    })
    .returning({ id: prodReceipts.id });
  await logEvent(tx, ctx, mr.workOrderId, `${mr.number}: delivery ${v.deliveryNote} received at the production store against ${res.ref} (${number})`, 'production.mr.delivery');
  return { receiptId: rc.id, number };
}

/** Purchase reports progress (through @orbit/core/supply). */
export async function onSupplyUpdate(tx: Tx, ctx: ActionContext, u: SupplyUpdate) {
  const mr = await lockMr(tx, ctx, u.sourceId);
  if (u.kind === 'po') {
    await logEvent(tx, ctx, mr.workOrderId, `${mr.number}: Purchase issued ${u.ref}${u.note ? ` (${u.note})` : ''}`);
    return;
  }
  if (u.kind === 'rejected') {
    await save(tx, mr.id, { status: 'store', returnNote: `Purchase rejected ${mr.purchaseRef ?? ''}: ${u.note ?? 'no reason given'}`, purchaseId: null, purchaseRef: null, lines: mr.lines.map((l) => ({ ...l, toBuy: 0 })) });
    await logEvent(tx, ctx, mr.workOrderId, `${mr.number}: Purchase rejected the request${u.note ? `: ${u.note}` : ''}`);
    return;
  }
  // issued (from the main store) or received (bought, accepted): into the production store.
  // Purchase reports totals per line; only what is new since the last report is booked.
  const idx = buyIndex(mr.lines);
  const lines = mr.lines.map((l) => ({ ...l }));
  const arrived: { item: string; qty: number; unit: string }[] = [];
  idx.forEach((i, k) => {
    const l = lines[i];
    const main = l.fromMain ?? 0;
    const q = r3(Math.max(0, (u.qty[k] ?? 0) - (u.kind === 'issued' ? main : l.received - main)));
    if (q <= 0) return;
    if (u.kind === 'issued') l.fromMain = r3(main + q);
    l.received = r3(l.received + q);
    arrived.push({ item: l.item, qty: q, unit: l.unit });
  });
  const where = u.kind === 'issued' ? 'from the main store' : u.receivedAt === 'purchase' ? 'from the purchase store' : 'at the production store';
  await stockIn(tx, ctx, arrived, `${mr.number} / ${u.ref}`, u.kind === 'issued' ? 'Issued from the main store' : `Purchase ${u.ref}`);
  // Everything asked for has arrived: ready to issue. Otherwise Purchase is still buying the rest.
  const complete = lines.every((l) => l.received >= l.toBuy - 1e-9);
  await save(tx, mr.id, { lines, status: complete ? 'ready' : 'purchase' });
  if (u.kind === 'received') await tx.update(prodReceipts).set({ status: 'accepted' }).where(and(eq(prodReceipts.mrId, mr.id), eq(prodReceipts.status, 'qc')));
  await logEvent(
    tx,
    ctx,
    mr.workOrderId,
    `${mr.number}: material arrived ${where} (${arrived.map((a) => `${a.item} ${fmtQty(a.qty)} ${a.unit}`).join(', ') || 'nothing new'}). ${complete ? 'Ready to issue.' : 'Issue it; Purchase is buying the rest.'}`,
  );
}

// ---------- reading ----------

export type MrFilter = 'action' | 'open' | 'all';

function actsOn(me: string, s: MrStatus) {
  if (s === 'store' || s === 'ready') return hasRole(me as never, 'store');
  if (s === 'engineer') return hasRole(me as never, 'engineer');
  if (s === 'manager') return hasRole(me as never, 'manager');
  return false;
}

export async function listMrs(tx: Tx, ctx: SessionContext, opts: { filter?: MrFilter; workOrderId?: string } = {}) {
  const me = await myRole(tx, ctx);
  const rows = await tx
    .select({ m: prodMatRequests, wo: prodWorkOrders.number, woTitle: prodWorkOrders.title })
    .from(prodMatRequests)
    .innerJoin(prodWorkOrders, eq(prodWorkOrders.id, prodMatRequests.workOrderId))
    .where(and(eq(prodMatRequests.companyId, ctx.companyId), opts.workOrderId ? eq(prodMatRequests.workOrderId, opts.workOrderId) : undefined))
    .orderBy(desc(prodMatRequests.createdAt))
    .limit(300);
  const people = await peopleById(tx, rows.map((r) => r.m.requestedBy));
  return rows
    .map(({ m, wo, woTitle }) => ({
      id: m.id,
      number: m.number,
      workOrderId: m.workOrderId,
      wo,
      woTitle,
      status: m.status,
      items: m.lines.map((l) => `${l.item} ${fmtQty(l.qty)} ${l.unit}`).join(', '),
      by: people.get(m.requestedBy) ?? '',
      purchaseRef: m.purchaseRef,
      returnNote: m.returnNote,
      actionable: actsOn(me, m.status),
      at: m.createdAt.toISOString(),
      days: Math.max(0, Math.floor((Date.now() - m.updatedAt.getTime()) / 864e5)),
    }))
    .filter((r) => (opts.filter === 'action' ? r.actionable : opts.filter === 'open' ? OPEN.includes(r.status) : true));
}
export type MrRow = Awaited<ReturnType<typeof listMrs>>[number];

export async function mrDetail(tx: Tx, ctx: SessionContext, id: string) {
  const me = await myRole(tx, ctx);
  const [m] = await tx.select().from(prodMatRequests).where(and(eq(prodMatRequests.id, id), eq(prodMatRequests.companyId, ctx.companyId)));
  if (!m) return null;
  const [wo] = await tx.select().from(prodWorkOrders).where(eq(prodWorkOrders.id, m.workOrderId));
  const avail = await availability(tx, ctx.companyId);
  const people = await peopleById(tx, [m.requestedBy, m.engineerId, m.managerId]);
  const purchase = m.purchaseId ? await purchaseStatus(tx, ctx.companyId, m.purchaseId) : null;
  const receipts = await tx.select().from(prodReceipts).where(eq(prodReceipts.mrId, m.id)).orderBy(desc(prodReceipts.createdAt));
  const idx = buyIndex(m.lines);
  return {
    me,
    mr: {
      id: m.id,
      number: m.number,
      status: m.status,
      note: m.note,
      returnNote: m.returnNote,
      by: people.get(m.requestedBy) ?? '',
      engineer: m.engineerId ? { name: people.get(m.engineerId) ?? '', at: m.engineerAt?.toISOString() ?? null } : null,
      manager: m.managerId ? { name: people.get(m.managerId) ?? '', at: m.managerAt?.toISOString() ?? null } : null,
      purchaseRef: m.purchaseRef,
      at: m.createdAt.toISOString(),
    },
    wo: { id: wo.id, number: wo.number, title: wo.title, status: wo.status },
    lines: m.lines.map((l) => ({ ...l, left: left(l), available: avail(l.item, l.unit) })),
    /** Lines Purchase is supplying, in Purchase's order (for recording a delivery). */
    buyLines: idx.map((i) => ({ item: m.lines[i].item, unit: m.lines[i].unit, toBuy: m.lines[i].toBuy, received: m.lines[i].received })),
    purchase,
    purchaseUsed: await purchaseOn(tx, ctx.companyId),
    receipts: receipts.map((r) => ({ id: r.id, number: r.number, reference: r.reference, status: r.status, at: r.createdAt.toISOString() })),
    can: {
      // While Purchase is still buying, whatever has already arrived can be issued.
      issue: (m.status === 'store' || m.status === 'ready' || (m.status === 'purchase' && m.lines.some((l) => l.received > 0 && l.issued < l.qty - 1e-9))) && hasRole(me, 'store', 'manager'),
      ask: m.status === 'store' && hasRole(me, 'store', 'manager'),
      approve: (m.status === 'engineer' && hasRole(me, 'engineer')) || (m.status === 'manager' && hasRole(me, 'manager')),
      deliver: m.status === 'purchase' && !!purchase?.receiving && hasRole(me, 'store', 'manager'),
      cancel: ['store', 'engineer', 'manager'].includes(m.status) && (m.requestedBy === ctx.membershipId || hasRole(me, 'manager')),
      docs: hasRole(me, 'store', 'manager'),
    },
  };
}
export type MrDetail = NonNullable<Awaited<ReturnType<typeof mrDetail>>>;

/** Open requests per work order (for the work order page). */
export async function openForWos(tx: Tx, ids: string[]) {
  if (!ids.length) return [];
  return tx.select({ id: prodMatRequests.id, workOrderId: prodMatRequests.workOrderId, status: prodMatRequests.status }).from(prodMatRequests).where(and(inArray(prodMatRequests.workOrderId, ids), inArray(prodMatRequests.status, OPEN)));
}
