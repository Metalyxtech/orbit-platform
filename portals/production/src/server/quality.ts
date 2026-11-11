import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext, SessionContext } from '@orbit/core';
import { prodInspections, prodNcrs, prodOperations, prodWorkOrders, type Tx } from '@orbit/db';
import { tradeOf } from '../trades';
import { afterOpsChange } from './progress';
import { lockWo, logEvent, myRole, nextNumber, peopleById, requireRole } from './shared';

// Quality: QC inspects operations that need it and the finished work (final inspection) using
// the trade's checklist. A fail opens an NCR and sends the work back for rework; passing the
// re-inspection closes the NCR.

const inspectInput = z.object({
  workOrderId: z.uuid(),
  /** Omitted for the final inspection. */
  operationId: z.uuid().optional(),
  checklist: z.array(z.object({ item: z.string().max(300), ok: z.boolean(), note: z.string().max(300).optional() })).max(60),
  remarks: z.string().trim().max(2000).optional(),
  /** Required when anything failed: what is wrong, and the action asked for. */
  ncr: z.object({ description: z.string().trim().min(5, 'Describe the non-conformance').max(2000), action: z.string().trim().max(1000).optional() }).optional(),
});

export async function inspect(tx: Tx, ctx: ActionContext, raw: z.input<typeof inspectInput>) {
  const v = inspectInput.parse(raw);
  requireRole(await myRole(tx, ctx), 'qc');
  const wo = await lockWo(tx, ctx, v.workOrderId);
  const pass = v.checklist.length > 0 && v.checklist.every((c) => c.ok);
  if (!v.checklist.length) throw new Error('Go through the checklist');
  if (!pass && !v.ncr) throw new Error('Something failed: describe the non-conformance for the NCR');
  let op: typeof prodOperations.$inferSelect | undefined;
  if (v.operationId) {
    [op] = await tx.select().from(prodOperations).where(and(eq(prodOperations.id, v.operationId), eq(prodOperations.workOrderId, wo.id)));
    if (!op) throw new Error('Operation not found');
    if (op.status !== 'awaiting_qc') throw new Error(`${op.name} is not waiting for QC`);
  } else if (wo.status !== 'final_qc') {
    throw new Error('This work order is not waiting for the final inspection');
  }
  const number = await nextNumber(tx, ctx.companyId, 'qc');
  const [ins] = await tx
    .insert(prodInspections)
    .values({ companyId: ctx.companyId, workOrderId: wo.id, operationId: op?.id ?? null, number, result: pass ? 'pass' : 'fail', checklist: v.checklist, remarks: v.remarks || null, byId: ctx.membershipId })
    .returning({ id: prodInspections.id });
  const what = op ? op.name : 'Final inspection';
  // Open NCRs on the same operation (or the final inspection) close when the re-inspection passes.
  const sameScope = and(eq(prodNcrs.workOrderId, wo.id), eq(prodNcrs.status, 'open'), op ? eq(prodNcrs.operationId, op.id) : isNull(prodNcrs.operationId));
  if (pass) {
    const closed = await tx.update(prodNcrs).set({ status: 'closed', closedBy: ctx.membershipId, closedAt: new Date() }).where(sameScope).returning({ number: prodNcrs.number });
    if (op) {
      await tx.update(prodOperations).set({ status: 'done' }).where(eq(prodOperations.id, op.id));
      await logEvent(tx, ctx, wo.id, `${number} ${what}: passed${closed.length ? `, ${closed.map((c) => c.number).join(', ')} closed` : ''}`, 'production.qc.pass');
      await afterOpsChange(tx, ctx, wo.id);
    } else {
      await tx.update(prodWorkOrders).set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() }).where(eq(prodWorkOrders.id, wo.id));
      await logEvent(tx, ctx, wo.id, `${number} Final inspection passed${closed.length ? `, ${closed.map((c) => c.number).join(', ')} closed` : ''}. Ready to dispatch.`, 'production.qc.pass');
    }
    return { result: 'pass' as const, number };
  }
  const ncrNo = await nextNumber(tx, ctx.companyId, 'ncr');
  await tx.insert(prodNcrs).values({ companyId: ctx.companyId, workOrderId: wo.id, inspectionId: ins.id, operationId: op?.id ?? null, number: ncrNo, description: v.ncr!.description, action: v.ncr!.action || null });
  if (op) await tx.update(prodOperations).set({ status: 'rework' }).where(eq(prodOperations.id, op.id));
  else await tx.update(prodWorkOrders).set({ status: 'in_progress', updatedAt: new Date() }).where(eq(prodWorkOrders.id, wo.id));
  await logEvent(tx, ctx, wo.id, `${number} ${what}: failed. ${ncrNo} raised: ${v.ncr!.description}. Sent back for rework.`, 'production.qc.fail');
  return { result: 'fail' as const, number, ncr: ncrNo };
}

/** The production manager or QC closes an NCR by hand (e.g. accepted by the customer as is). */
export async function closeNcr(tx: Tx, ctx: ActionContext, raw: { id: string; action: string }) {
  const v = z.object({ id: z.uuid(), action: z.string().trim().min(3, 'Say how it was resolved').max(1000) }).parse(raw);
  requireRole(await myRole(tx, ctx), 'manager', 'qc');
  const [n] = await tx.select().from(prodNcrs).where(and(eq(prodNcrs.id, v.id), eq(prodNcrs.companyId, ctx.companyId)));
  if (!n) throw new Error('NCR not found');
  if (n.status !== 'open') throw new Error('This NCR is already closed');
  await tx.update(prodNcrs).set({ status: 'closed', action: v.action, closedBy: ctx.membershipId, closedAt: new Date() }).where(eq(prodNcrs.id, n.id));
  await logEvent(tx, ctx, n.workOrderId, `${n.number} closed: ${v.action}`, 'production.ncr.close');
  return { ok: true as const };
}

/** What QC has to inspect now: operations waiting and work orders at final inspection. */
export async function qcWork(tx: Tx, ctx: SessionContext) {
  const wos = await tx.select().from(prodWorkOrders).where(and(eq(prodWorkOrders.companyId, ctx.companyId), inArray(prodWorkOrders.status, ['in_progress', 'released', 'final_qc'])));
  if (!wos.length) return [];
  const ops = await tx.select().from(prodOperations).where(and(inArray(prodOperations.workOrderId, wos.map((w) => w.id)), eq(prodOperations.status, 'awaiting_qc'))).orderBy(asc(prodOperations.position));
  const items = [
    ...ops.map((o) => {
      const w = wos.find((x) => x.id === o.workOrderId)!;
      return { workOrderId: w.id, number: w.number, title: w.title, trade: tradeOf(w.trade).name, what: o.name, operationId: o.id as string | null, priority: w.priority, due: w.due };
    }),
    ...wos.filter((w) => w.status === 'final_qc').map((w) => ({ workOrderId: w.id, number: w.number, title: w.title, trade: tradeOf(w.trade).name, what: 'Final inspection', operationId: null as string | null, priority: w.priority, due: w.due })),
  ];
  return items;
}

/** Inspection register and NCR list. */
export async function qualityLog(tx: Tx, ctx: SessionContext) {
  const [ins, ncrs] = await Promise.all([
    tx
      .select({ i: prodInspections, number: prodWorkOrders.number, title: prodWorkOrders.title, op: prodOperations.name })
      .from(prodInspections)
      .innerJoin(prodWorkOrders, eq(prodWorkOrders.id, prodInspections.workOrderId))
      .leftJoin(prodOperations, eq(prodOperations.id, prodInspections.operationId))
      .where(eq(prodInspections.companyId, ctx.companyId))
      .orderBy(desc(prodInspections.createdAt))
      .limit(300),
    tx
      .select({ n: prodNcrs, number: prodWorkOrders.number, title: prodWorkOrders.title, op: prodOperations.name })
      .from(prodNcrs)
      .innerJoin(prodWorkOrders, eq(prodWorkOrders.id, prodNcrs.workOrderId))
      .leftJoin(prodOperations, eq(prodOperations.id, prodNcrs.operationId))
      .where(eq(prodNcrs.companyId, ctx.companyId))
      .orderBy(desc(prodNcrs.createdAt))
      .limit(300),
  ]);
  const people = await peopleById(tx, ins.map((x) => x.i.byId));
  return {
    inspections: ins.map(({ i, number, title, op }) => ({ id: i.id, workOrderId: i.workOrderId, qcNo: i.number, number, title, what: op ?? 'Final inspection', result: i.result, remarks: i.remarks, by: i.byId ? (people.get(i.byId) ?? '') : '', at: i.createdAt.toISOString() })),
    ncrs: ncrs.map(({ n, number, title, op }) => ({ id: n.id, workOrderId: n.workOrderId, ncrNo: n.number, number, title, what: op ?? 'Final inspection', description: n.description, action: n.action, status: n.status, at: n.createdAt.toISOString(), closedAt: n.closedAt?.toISOString() ?? null })),
  };
}
