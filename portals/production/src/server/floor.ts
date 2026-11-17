import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext, SessionContext } from '@orbit/core';
import { prodOperations, prodReports, prodWorkOrders, type Tx } from '@orbit/db';
import { fmtQty } from '../config';
import { tradeOf } from '../trades';
import { drawingCounts } from './drawings';
import { afterOpsChange, sendToQualityOrComplete } from './progress';
import { hasRole, loadConfig, lockWo, logEvent, myRole, peopleById, requireRole, today } from './shared';
import { hiddenIds } from './scope';

// Shop floor: the supervisor's daily production report (output, hours, crew per operation)
// and marking rework done after QC sends something back.

const reportInput = z.object({
  workOrderId: z.uuid(),
  operationId: z.uuid(),
  day: z.iso.date(),
  qty: z.number().min(0).max(1e9),
  hours: z.number().min(0).max(10000).default(0),
  workers: z.number().int().min(0).max(10000).default(0),
  shift: z.string().trim().max(40).optional(),
  remarks: z.string().trim().max(1000).optional(),
});

/**
 * Records output for one operation on one day. An operation cannot get ahead of the one before it,
 * and the total cannot go past the work-order quantity plus the allowed overrun.
 */
export async function reportOutput(tx: Tx, ctx: ActionContext, raw: z.input<typeof reportInput>) {
  const v = reportInput.parse(raw);
  requireRole(await myRole(tx, ctx), 'supervisor', 'manager');
  if (v.day > today()) throw new Error('The report date cannot be in the future');
  if (v.qty === 0 && v.hours === 0) throw new Error('Enter the quantity done or the hours worked');
  const wo = await lockWo(tx, ctx, v.workOrderId);
  if (!['released', 'in_progress'].includes(wo.status)) throw new Error('Production can be reported only on a released work order');
  const ops = await tx.select().from(prodOperations).where(eq(prodOperations.workOrderId, wo.id)).orderBy(asc(prodOperations.position));
  const i = ops.findIndex((o) => o.id === v.operationId);
  if (i < 0) throw new Error('Operation not found');
  const op = ops[i];
  if (op.status === 'awaiting_qc') throw new Error(`${op.name} is waiting for QC`);
  if (op.status === 'done' && v.qty > 0) throw new Error(`${op.name} is already complete`);
  const cfg = await loadConfig(tx, ctx.companyId);
  const max = wo.qty * (1 + cfg.overrunPct / 100);
  const newDone = op.doneQty + v.qty;
  if (newDone > max + 1e-9) throw new Error(`${op.name}: total would be ${fmtQty(newDone)} ${wo.unit}, more than the ${fmtQty(wo.qty)} ordered (+${cfg.overrunPct}%)`);
  if (i > 0 && newDone > ops[i - 1].doneQty + 1e-9) throw new Error(`${op.name} cannot be ahead of ${ops[i - 1].name} (${fmtQty(ops[i - 1].doneQty)} ${wo.unit} done)`);
  await tx.insert(prodReports).values({ companyId: ctx.companyId, workOrderId: wo.id, operationId: op.id, day: v.day, qty: v.qty, hours: v.hours, workers: v.workers, shift: v.shift || null, remarks: v.remarks || null, byId: ctx.membershipId });
  const complete = newDone >= wo.qty - 1e-9;
  const status = complete ? 'done' : 'running';
  await tx.update(prodOperations).set({ doneQty: newDone, hours: op.hours + v.hours, status }).where(eq(prodOperations.id, op.id));
  if (wo.status === 'released') {
    await tx.update(prodWorkOrders).set({ status: 'in_progress', updatedAt: new Date() }).where(eq(prodWorkOrders.id, wo.id));
    await logEvent(tx, ctx, wo.id, 'Production started', 'production.wo.start');
  }
  await logEvent(tx, ctx, wo.id, `${op.name}: ${fmtQty(v.qty)} ${wo.unit} on ${v.day}${v.hours ? `, ${v.hours} h` : ''}${v.workers ? `, ${v.workers} people` : ''}${complete ? '. Complete.' : ''}`);
  if (status === 'done') await afterOpsChange(tx, ctx, wo.id);
  return { status };
}

/** After QC failed the work, the floor corrects it and sends it to QC again. */
export async function finalReworkDone(tx: Tx, ctx: ActionContext, raw: { workOrderId: string; remarks: string }) {
  const v = z.object({ workOrderId: z.uuid(), remarks: z.string().trim().min(3, 'Say what was corrected').max(1000) }).parse(raw);
  requireRole(await myRole(tx, ctx), 'supervisor', 'manager');
  const wo = await lockWo(tx, ctx, v.workOrderId);
  const ops = await tx.select({ status: prodOperations.status }).from(prodOperations).where(eq(prodOperations.workOrderId, wo.id));
  if (wo.status !== 'in_progress' || !wo.returnedNote || ops.some((o) => o.status !== 'done')) throw new Error('Nothing is waiting for rework after QC');
  await sendToQualityOrComplete(tx, ctx, wo, `Rework done (${v.remarks}).`);
  return { ok: true as const };
}

/** Operations the supervisor can report on today, across all work orders on the floor. */
export async function floorOperations(tx: Tx, ctx: SessionContext) {
  const hidden = await hiddenIds(tx, ctx);
  const wos = (await tx.select().from(prodWorkOrders).where(and(eq(prodWorkOrders.companyId, ctx.companyId), inArray(prodWorkOrders.status, ['released', 'in_progress']))).orderBy(asc(prodWorkOrders.due))).filter((w) => !hidden.has(w.id));
  if (!wos.length) return [];
  const ops = await tx.select().from(prodOperations).where(inArray(prodOperations.workOrderId, wos.map((w) => w.id))).orderBy(asc(prodOperations.position));
  const drawings = await drawingCounts(tx, ctx);
  return wos.map((w) => ({
    drawings: drawings.get(w.id) ?? 0,
    id: w.id,
    number: w.number,
    title: w.title,
    trade: tradeOf(w.trade).name,
    qty: w.qty,
    unit: w.unit,
    due: w.due,
    priority: w.priority,
    ops: ops.filter((o) => o.workOrderId === w.id).map((o) => ({ id: o.id, name: o.name, doneQty: o.doneQty, status: o.status, qc: o.qcRequired })),
  }));
}
export type FloorWo = Awaited<ReturnType<typeof floorOperations>>[number];

/** Output log: recent report lines (supervisors see their own unless they manage). */
export async function outputLog(tx: Tx, ctx: SessionContext, days = 14) {
  const me = await myRole(tx, ctx);
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const conds = [eq(prodReports.companyId, ctx.companyId), gte(prodReports.day, from)];
  if (!hasRole(me, 'manager', 'gm', 'engineer', 'qc', 'store')) conds.push(eq(prodReports.byId, ctx.membershipId));
  const rows = await tx
    .select({ r: prodReports, number: prodWorkOrders.number, title: prodWorkOrders.title, unit: prodWorkOrders.unit, op: prodOperations.name })
    .from(prodReports)
    .innerJoin(prodWorkOrders, eq(prodWorkOrders.id, prodReports.workOrderId))
    .innerJoin(prodOperations, eq(prodOperations.id, prodReports.operationId))
    .where(and(...conds))
    .orderBy(desc(prodReports.day), desc(prodReports.createdAt))
    .limit(500);
  const hiddenWo = await hiddenIds(tx, ctx);
  const seen = rows.filter((x) => !hiddenWo.has(x.r.workOrderId));
  rows.length = 0;
  rows.push(...seen);
  const people = await peopleById(tx, rows.map((x) => x.r.byId));
  const totals = await tx
    .select({ day: prodReports.day, hours: sql<number>`coalesce(sum(${prodReports.hours}), 0)::float`, workers: sql<number>`coalesce(sum(${prodReports.workers}), 0)::int`, lines: sql<number>`count(*)::int` })
    .from(prodReports)
    .where(and(...conds))
    .groupBy(prodReports.day)
    .orderBy(desc(prodReports.day));
  return {
    rows: rows.map(({ r, number, title, unit, op }) => ({ id: r.id, workOrderId: r.workOrderId, day: r.day, number, title, unit, operation: op, qty: r.qty, hours: r.hours, workers: r.workers, shift: r.shift, remarks: r.remarks, by: r.byId ? (people.get(r.byId) ?? '') : '' })),
    byDay: totals,
  };
}
