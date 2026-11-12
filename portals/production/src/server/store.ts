import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext, SessionContext } from '@orbit/core';
import { prodIssues, prodMaterials, prodWorkOrders, type Tx } from '@orbit/db';
import { fmtQty } from '../config';
import { loadConfig, lockWo, logEvent, myRole, requireRole } from './shared';
import { stockIn, stockOut } from './stock';
import { hiddenIds } from './scope';

// Store: issues materials against a work order's bill of materials from the production store stock
// (a negative quantity is a return) and dispatches finished work orders.

const issueInput = z.object({
  workOrderId: z.uuid(),
  lines: z.array(z.object({ materialId: z.uuid(), qty: z.number().min(-1e9).max(1e9) })).min(1).max(200),
  note: z.string().trim().max(500).optional(),
});

export async function issueMaterials(tx: Tx, ctx: ActionContext, raw: z.input<typeof issueInput>) {
  const v = issueInput.parse(raw);
  requireRole(await myRole(tx, ctx), 'store', 'manager');
  const wo = await lockWo(tx, ctx, v.workOrderId);
  if (!['released', 'in_progress', 'final_qc'].includes(wo.status)) throw new Error('Materials are issued only to a released work order');
  const lines = v.lines.filter((l) => l.qty !== 0);
  if (!lines.length) throw new Error('Enter a quantity to issue');
  const mats = await tx.select().from(prodMaterials).where(and(eq(prodMaterials.workOrderId, wo.id), inArray(prodMaterials.id, lines.map((l) => l.materialId))));
  const cfg = await loadConfig(tx, ctx.companyId);
  const done: string[] = [];
  for (const l of lines) {
    const m = mats.find((x) => x.id === l.materialId);
    if (!m) throw new Error('Material not found on this work order');
    const next = m.issuedQty + l.qty;
    if (next < -1e-9) throw new Error(`${m.item}: cannot return more than was issued (${fmtQty(m.issuedQty)} ${m.unit})`);
    if (next > m.qty * (1 + cfg.overrunPct / 100) + 1e-9) throw new Error(`${m.item}: ${fmtQty(next)} ${m.unit} is more than planned (${fmtQty(m.qty)}, +${cfg.overrunPct}%)`);
    // Issues come out of the production store stock; returns go back into it.
    if (l.qty > 0) await stockOut(tx, ctx, { item: m.item, qty: l.qty, unit: m.unit }, wo.number, v.note || 'Issued to work order');
    else await stockIn(tx, ctx, [{ item: m.item, qty: -l.qty, unit: m.unit }], wo.number, v.note || 'Returned from the work order');
    await tx.update(prodMaterials).set({ issuedQty: next }).where(eq(prodMaterials.id, m.id));
    await tx.insert(prodIssues).values({ companyId: ctx.companyId, workOrderId: wo.id, materialId: m.id, qty: l.qty, note: v.note || null, byId: ctx.membershipId });
    done.push(`${m.item} ${l.qty > 0 ? '' : 'returned '}${fmtQty(Math.abs(l.qty))} ${m.unit}`);
  }
  await logEvent(tx, ctx, wo.id, `Material issued: ${done.join(', ')}${v.note ? ` (${v.note})` : ''}`, 'production.store.issue');
  return { ok: true as const };
}

/** Finished goods leave the factory: delivery note / vehicle recorded on the work order. */
export async function dispatch(tx: Tx, ctx: ActionContext, raw: { workOrderId: string; reference: string }) {
  const v = z.object({ workOrderId: z.uuid(), reference: z.string().trim().min(2, 'Enter the delivery note or vehicle number').max(200) }).parse(raw);
  requireRole(await myRole(tx, ctx), 'store', 'manager');
  const wo = await lockWo(tx, ctx, v.workOrderId);
  if (wo.status !== 'completed') throw new Error('Only a completed work order (QC passed) can be dispatched');
  await tx.update(prodWorkOrders).set({ status: 'dispatched', dispatchedAt: new Date(), updatedAt: new Date() }).where(eq(prodWorkOrders.id, wo.id));
  await logEvent(tx, ctx, wo.id, `Dispatched: ${fmtQty(wo.qty)} ${wo.unit}. ${v.reference}`, 'production.wo.dispatch');
  return { ok: true as const };
}

/** The store's lists: materials still to issue, and finished work waiting to go out. */
export async function storeWork(tx: Tx, ctx: SessionContext) {
  const hidden = await hiddenIds(tx, ctx);
  const wos = (await tx.select().from(prodWorkOrders).where(and(eq(prodWorkOrders.companyId, ctx.companyId), inArray(prodWorkOrders.status, ['released', 'in_progress', 'final_qc', 'completed'])))).filter((w) => !hidden.has(w.id));
  const mats = wos.length ? await tx.select().from(prodMaterials).where(inArray(prodMaterials.workOrderId, wos.map((w) => w.id))) : [];
  return {
    toIssue: wos
      .filter((w) => w.status !== 'completed')
      .map((w) => ({ id: w.id, number: w.number, title: w.title, due: w.due, priority: w.priority, short: mats.filter((m) => m.workOrderId === w.id && m.issuedQty < m.qty - 1e-9).map((m) => ({ item: m.item, left: m.qty - m.issuedQty, unit: m.unit })) }))
      .filter((w) => w.short.length),
    toDispatch: wos.filter((w) => w.status === 'completed').map((w) => ({ id: w.id, number: w.number, title: w.title, customer: w.customer, qty: w.qty, unit: w.unit, due: w.due })),
  };
}
