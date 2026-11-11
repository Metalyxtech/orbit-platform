import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext, SessionContext } from '@orbit/core';
import { latestInspection } from '@orbit/core/quality';
import { processThread } from '@orbit/core/holds';
import { prodEvents, prodMaterials, prodOperations, prodReports, prodWorkOrders, salesCustomers, salesOrders, type Tx } from '@orbit/db';
import { OPEN_STATUSES, WO_STATUS, type OpStatus, type ProdRole, type WoStatus } from '../config';
import { TRADES, tradeOf } from '../trades';
import { customerDocuments, listDrawings } from './drawings';
import { listMrs, type MrRow } from './mr';
import { hasRole, loadConfig, lockWo, logEvent, myRole, nextNumber, peopleById, requireRole, today } from './shared';

// Work orders: planning (trade form, materials, operations), release by the production manager,
// cancel, lists and the work-order page with what each role may do next.

const woInput = z.object({
  trade: z.string().refine((t) => TRADES.some((x) => x.id === t), 'Choose a trade'),
  title: z.string().trim().min(3, 'Describe what to make').max(200),
  customer: z.string().trim().max(160).optional(),
  salesOrderId: z.uuid().optional(),
  qty: z.number().positive('Enter the quantity').max(1e9),
  unit: z.string().trim().min(1).max(20),
  due: z.iso.date().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  fields: z.record(z.string(), z.string().max(500)).default({}),
  notes: z.string().trim().max(4000).optional(),
  materials: z.array(z.object({ item: z.string().trim().min(1).max(200), qty: z.number().min(0).max(1e9), unit: z.string().trim().min(1).max(20) })).max(200).default([]),
  operations: z.array(z.object({ name: z.string().trim().min(1).max(120) })).min(1, 'Add at least one operation').max(50),
});
export type WoInput = z.input<typeof woInput>;

/** Required trade-form fields must be filled before the work order goes for release. */
function assertForm(trade: string, fields: Record<string, string>) {
  const missing = tradeOf(trade).fields.filter((f) => f.required && !String(fields[f.id] ?? '').trim());
  if (missing.length) throw new Error(`Fill in: ${missing.map((f) => f.label).join(', ')}`);
}

async function writeLines(tx: Tx, ctx: ActionContext, woId: string, v: z.output<typeof woInput>) {
  await tx.delete(prodMaterials).where(eq(prodMaterials.workOrderId, woId));
  await tx.delete(prodOperations).where(eq(prodOperations.workOrderId, woId));
  const mats = v.materials.filter((m) => m.item.trim());
  if (mats.length) await tx.insert(prodMaterials).values(mats.map((m, i) => ({ companyId: ctx.companyId, workOrderId: woId, position: i, item: m.item, qty: m.qty, unit: m.unit })));
  await tx.insert(prodOperations).values(v.operations.map((o, i) => ({ companyId: ctx.companyId, workOrderId: woId, position: i, name: o.name })));
}

/** Plans a work order (draft), or plans and sends it for release in one go. */
export async function createWorkOrder(tx: Tx, ctx: ActionContext, raw: WoInput & { submit?: boolean }) {
  requireRole(await myRole(tx, ctx), 'engineer', 'manager');
  const v = woInput.parse(raw);
  if (raw.submit) assertForm(v.trade, v.fields);
  const number = await nextNumber(tx, ctx.companyId, 'wo');
  const [wo] = await tx
    .insert(prodWorkOrders)
    .values({ companyId: ctx.companyId, number, trade: v.trade, title: v.title, customer: v.customer || null, salesOrderId: v.salesOrderId ?? null, qty: v.qty, unit: v.unit, due: v.due ?? null, priority: v.priority, fields: v.fields, notes: v.notes || null, createdBy: ctx.membershipId })
    .returning({ id: prodWorkOrders.id });
  await writeLines(tx, ctx, wo.id, v);
  await logEvent(tx, ctx, wo.id, `${number} planned: ${v.title} (${tradeOf(v.trade).name}), ${v.qty} ${v.unit}`, 'production.wo.create');
  if (raw.submit) await submitForRelease(tx, ctx, { id: wo.id });
  return { id: wo.id, number };
}

/** Changes a draft (the engineer's plan) before it goes for release. */
export async function updateWorkOrder(tx: Tx, ctx: ActionContext, raw: WoInput & { id: string }) {
  requireRole(await myRole(tx, ctx), 'engineer', 'manager');
  const v = woInput.parse(raw);
  const r = await lockWo(tx, ctx, z.uuid().parse(raw.id));
  if (r.status !== 'draft') throw new Error('Only a draft can be changed. Ask the production manager to send it back.');
  await tx
    .update(prodWorkOrders)
    .set({ trade: v.trade, title: v.title, customer: v.customer || null, qty: v.qty, unit: v.unit, due: v.due ?? null, priority: v.priority, fields: v.fields, notes: v.notes || null, updatedAt: new Date() })
    .where(eq(prodWorkOrders.id, r.id));
  await writeLines(tx, ctx, r.id, v);
  await logEvent(tx, ctx, r.id, 'Plan updated');
  return { ok: true as const };
}

/** The engineer sends the plan to the production manager (or straight to the floor if no release is needed). */
export async function submitForRelease(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  requireRole(await myRole(tx, ctx), 'engineer', 'manager');
  const r = await lockWo(tx, ctx, z.uuid().parse(raw.id));
  if (r.status !== 'draft') throw new Error('This work order is not a draft');
  const ops = await tx.select({ id: prodOperations.id }).from(prodOperations).where(eq(prodOperations.workOrderId, r.id));
  if (!ops.length) throw new Error('Add at least one operation');
  assertForm(r.trade, (r.fields ?? {}) as Record<string, string>);
  const cfg = await loadConfig(tx, ctx.companyId);
  if (cfg.requireRelease) {
    await tx.update(prodWorkOrders).set({ status: 'pending_release', returnedNote: null, updatedAt: new Date() }).where(eq(prodWorkOrders.id, r.id));
    await logEvent(tx, ctx, r.id, 'Sent to the production manager for release', 'production.wo.submit');
  } else {
    await tx.update(prodWorkOrders).set({ status: 'released', returnedNote: null, releasedBy: ctx.membershipId, releasedAt: new Date(), updatedAt: new Date() }).where(eq(prodWorkOrders.id, r.id));
    await logEvent(tx, ctx, r.id, 'Released to the shop floor', 'production.wo.release');
  }
  return { ok: true as const };
}

/** The production manager releases the work order to the floor, or sends the plan back with a reason. */
export async function decideRelease(tx: Tx, ctx: ActionContext, raw: { id: string; release: boolean; note?: string }) {
  const v = z.object({ id: z.uuid(), release: z.boolean(), note: z.string().trim().max(1000).optional() }).parse(raw);
  requireRole(await myRole(tx, ctx), 'manager');
  const r = await lockWo(tx, ctx, v.id);
  if (r.status !== 'pending_release') throw new Error('This work order is not waiting for release');
  if (!v.release && !v.note) throw new Error('Say what the engineer should change');
  if (v.release) {
    await tx.update(prodWorkOrders).set({ status: 'released', releasedBy: ctx.membershipId, releasedAt: new Date(), updatedAt: new Date() }).where(eq(prodWorkOrders.id, r.id));
    await logEvent(tx, ctx, r.id, `Released to the shop floor${v.note ? `. Note: ${v.note}` : ''}`, 'production.wo.release');
  } else {
    await tx.update(prodWorkOrders).set({ status: 'draft', returnedNote: v.note, updatedAt: new Date() }).where(eq(prodWorkOrders.id, r.id));
    await logEvent(tx, ctx, r.id, `Sent back to the engineer: ${v.note}`, 'production.wo.return');
  }
  return { ok: true as const };
}

export async function cancelWorkOrder(tx: Tx, ctx: ActionContext, raw: { id: string; reason: string }) {
  const v = z.object({ id: z.uuid(), reason: z.string().trim().min(3, 'Give a reason').max(500) }).parse(raw);
  requireRole(await myRole(tx, ctx), 'manager');
  const r = await lockWo(tx, ctx, v.id);
  if (['dispatched', 'cancelled'].includes(r.status)) throw new Error('This work order is already closed');
  await tx.update(prodWorkOrders).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(prodWorkOrders.id, r.id));
  await logEvent(tx, ctx, r.id, `Cancelled: ${v.reason}`, 'production.wo.cancel');
  return { ok: true as const };
}

export type WoFilter = 'open' | 'floor' | 'done' | 'all' | 'late';

/** Work orders with progress, newest first. */
export async function listWorkOrders(tx: Tx, ctx: SessionContext, f: { filter?: WoFilter; trade?: string; q?: string } = {}) {
  const conds = [eq(prodWorkOrders.companyId, ctx.companyId)];
  if (f.filter === 'open' || f.filter === 'late') conds.push(inArray(prodWorkOrders.status, OPEN_STATUSES));
  if (f.filter === 'floor') conds.push(inArray(prodWorkOrders.status, ['released', 'in_progress', 'final_qc']));
  if (f.filter === 'done') conds.push(inArray(prodWorkOrders.status, ['completed', 'dispatched', 'cancelled']));
  if (f.trade) conds.push(eq(prodWorkOrders.trade, f.trade));
  const rows = await tx.select().from(prodWorkOrders).where(and(...conds)).orderBy(desc(prodWorkOrders.createdAt)).limit(500);
  const ids = rows.map((r) => r.id);
  const ops = ids.length ? await tx.select({ wo: prodOperations.workOrderId, done: prodOperations.doneQty, status: prodOperations.status }).from(prodOperations).where(inArray(prodOperations.workOrderId, ids)) : [];
  const t0 = today();
  const q = (f.q ?? '').toLowerCase();
  return rows
    .filter((r) => !q || `${r.number} ${r.title} ${r.customer ?? ''}`.toLowerCase().includes(q))
    .map((r) => {
      const mine = ops.filter((o) => o.wo === r.id);
      const progress = mine.length ? Math.round((mine.reduce((n, o) => n + Math.min(1, o.done / r.qty), 0) / mine.length) * 100) : 0;
      const late = !!r.due && r.due < t0 && OPEN_STATUSES.includes(r.status as WoStatus);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        customer: r.customer,
        trade: tradeOf(r.trade).name,
        tradeId: r.trade,
        qty: r.qty,
        unit: r.unit,
        due: r.due,
        priority: r.priority,
        status: r.status as WoStatus,
        statusLabel: WO_STATUS[r.status as WoStatus]?.label ?? r.status,
        progress,
        opsDone: mine.filter((o) => o.status === 'done').length,
        opsTotal: mine.length,
        /** QC failed it and it is back on the floor for rework. */
        rework: r.status === 'in_progress' && !!r.returnedNote,
        late,
      };
    })
    .filter((r) => f.filter !== 'late' || r.late);
}
export type WoRow = Awaited<ReturnType<typeof listWorkOrders>>[number];

/** Everything on one work order, with what this person may do next. */
export async function workOrderDetail(tx: Tx, ctx: SessionContext, id: string) {
  const me = await myRole(tx, ctx);
  const cfg = await loadConfig(tx, ctx.companyId);
  const [wo] = await tx.select().from(prodWorkOrders).where(and(eq(prodWorkOrders.id, id), eq(prodWorkOrders.companyId, ctx.companyId)));
  if (!wo) return null;
  const [ops, mats, reports, events, qc] = await Promise.all([
    tx.select().from(prodOperations).where(eq(prodOperations.workOrderId, wo.id)).orderBy(asc(prodOperations.position)),
    tx.select().from(prodMaterials).where(eq(prodMaterials.workOrderId, wo.id)).orderBy(asc(prodMaterials.position)),
    tx.select().from(prodReports).where(eq(prodReports.workOrderId, wo.id)).orderBy(desc(prodReports.day), desc(prodReports.createdAt)).limit(200),
    tx.select().from(prodEvents).where(eq(prodEvents.workOrderId, wo.id)).orderBy(desc(prodEvents.createdAt)),
    latestInspection(tx, ctx.companyId, 'production', wo.id),
  ]);
  const people = await peopleById(tx, [wo.createdBy, wo.releasedBy, ...events.map((e) => e.byId), ...reports.map((r) => r.byId)]);
  const name = (x: string | null) => (x ? (people.get(x) ?? '') : '');
  const [drawings, customerDocs] = await Promise.all([listDrawings(tx, ctx, wo.id), customerDocuments(tx, ctx, wo.salesOrderId)]);
  let salesOrder: string | null = null;
  if (wo.salesOrderId) salesOrder = (await salesOrderNumber(tx, ctx.companyId, wo.salesOrderId)) ?? null;
  const status = wo.status as WoStatus;
  const floor = status === 'released' || status === 'in_progress';
  const opName = new Map(ops.map((o) => [o.id, o.name]));
  return {
    me,
    cfg,
    trade: tradeOf(wo.trade),
    wo: { ...wo, status, createdByName: name(wo.createdBy), releasedByName: name(wo.releasedBy), salesOrder, late: !!wo.due && wo.due < today() && OPEN_STATUSES.includes(status) },
    ops: ops.map((o) => ({ ...o, status: o.status as OpStatus })),
    materials: mats,
    /** GM hold and comments. */
    control: await processThread(tx, ctx, 'work_order', wo.id),
    /** Material requests on this work order (empty before migration 0027). */
    mrs: await tx.transaction((sp) => listMrs(sp, ctx, { workOrderId: wo.id })).catch((): MrRow[] => []),
    reports: reports.map((r) => ({ ...r, operation: opName.get(r.operationId) ?? '', by: name(r.byId), createdAt: r.createdAt.toISOString() })),
    /** Latest QC inspection in the Quality portal (null when none). */
    qc: qc ? { ...qc, approvedAt: qc.approvedAt?.toISOString() ?? null } : null,
    events: events.map((e) => ({ id: e.id, text: e.text, by: name(e.byId), at: e.createdAt.toISOString() })),
    drawings,
    customerDocs,
    can: {
      drawings: !['dispatched', 'cancelled'].includes(status) && hasRole(me, 'engineer', 'manager'),
      edit: status === 'draft' && hasRole(me, 'engineer', 'manager'),
      submit: status === 'draft' && hasRole(me, 'engineer', 'manager'),
      release: status === 'pending_release' && hasRole(me, 'manager'),
      cancel: !['dispatched', 'cancelled'].includes(status) && hasRole(me, 'manager'),
      issue: ['released', 'in_progress', 'final_qc'].includes(status) && mats.length > 0 && hasRole(me, 'store', 'manager'),
      report: floor && hasRole(me, 'supervisor', 'manager'),
      reworkDone: status === 'in_progress' && !!wo.returnedNote && ops.every((o) => o.status === 'done') && hasRole(me, 'supervisor', 'manager'),
      dispatch: status === 'completed' && hasRole(me, 'store', 'manager'),
      requestMaterial: ['released', 'in_progress'].includes(status) && hasRole(me, 'supervisor', 'engineer', 'manager'),
    },
  };
}
export type WoDetail = NonNullable<Awaited<ReturnType<typeof workOrderDetail>>>;

async function salesOrderNumber(tx: Tx, companyId: string, id: string) {
  try {
    return await tx.transaction(async (sp) => {
      const [so] = await sp.select({ number: salesOrders.number }).from(salesOrders).where(and(eq(salesOrders.id, id), eq(salesOrders.companyId, companyId)));
      return so?.number;
    });
  } catch {
    return undefined;
  }
}

/**
 * Won sales orders (Sales portal) not yet planned as a work order, so the engineer can start from
 * them. Empty when the company has no Sales data.
 */
export async function salesOrdersToPlan(tx: Tx, ctx: SessionContext) {
  try {
    return await tx.transaction(async (sp) => {
      const planned = await sp.select({ so: prodWorkOrders.salesOrderId }).from(prodWorkOrders).where(and(eq(prodWorkOrders.companyId, ctx.companyId), isNotNull(prodWorkOrders.salesOrderId)));
      const rows = await sp
        .select({ id: salesOrders.id, number: salesOrders.number, title: salesOrders.title, customer: salesCustomers.name, status: salesOrders.status })
        .from(salesOrders)
        .innerJoin(salesCustomers, eq(salesCustomers.id, salesOrders.customerId))
        .where(and(eq(salesOrders.companyId, ctx.companyId), inArray(salesOrders.status, ['confirmed', 'production'])))
        .orderBy(desc(salesOrders.createdAt))
        .limit(100);
      const done = new Set(planned.map((p) => p.so));
      return rows.filter((r) => !done.has(r.id));
    });
  } catch {
    return [];
  }
}

/** Counts used on lists and the dashboard. */
export async function countByStatus(tx: Tx, ctx: SessionContext) {
  const rows = await tx.select({ status: prodWorkOrders.status, n: sql<number>`count(*)::int` }).from(prodWorkOrders).where(eq(prodWorkOrders.companyId, ctx.companyId)).groupBy(prodWorkOrders.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<WoStatus, number>>;
}

export const rolesThatPlan: ProdRole[] = ['engineer', 'manager', 'admin'];

/** Names a work order for GM process control. */
export async function describeWo(tx: Tx, companyId: string, id: string) {
  const [w] = await tx.select({ number: prodWorkOrders.number, title: prodWorkOrders.title }).from(prodWorkOrders).where(and(eq(prodWorkOrders.id, id), eq(prodWorkOrders.companyId, companyId)));
  return w ? { ref: w.number, title: w.title, href: `/production/order?id=${id}` } : null;
}
