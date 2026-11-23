import { asc, eq } from 'drizzle-orm';
import type { ActionContext } from '@orbit/core';
import { qualityOn, requestInspection, type QualityDecision } from '@orbit/core/quality';
import { prodDocs, prodOperations, prodWorkOrders, type Tx } from '@orbit/db';
import { fmtDate, fmtQty } from '../config';
import { tradeOf } from '../trades';
import { lockWo, logEvent } from './shared';

// Finished work and quality. When every operation is done the work order goes to QC in the
// Quality portal (if the company has it) with the trade's checklist, the work-order form and the
// drawings; otherwise it is ready to dispatch. QC's final result comes back through
// onQualityResult (registered with @orbit/core/quality), so this portal never imports Quality.

type Wo = typeof prodWorkOrders.$inferSelect;

async function qcRequestFor(tx: Tx, wo: Wo) {
  const trade = tradeOf(wo.trade);
  const docs = await tx.select().from(prodDocs).where(eq(prodDocs.workOrderId, wo.id)).orderBy(asc(prodDocs.createdAt));
  const fields = (wo.fields ?? {}) as Record<string, string>;
  return {
    source: 'production' as const,
    sourceId: wo.id,
    sourceRef: wo.number,
    title: wo.title,
    party: wo.customer,
    details: [
      { label: 'Trade', value: trade.name },
      { label: 'Quantity', value: `${fmtQty(wo.qty)} ${wo.unit}` },
      ...(wo.due ? [{ label: 'Due', value: fmtDate(wo.due) }] : []),
      ...trade.fields.filter((f) => fields[f.id]).map((f) => ({ label: f.label, value: `${fields[f.id]}${f.unit ? ` ${f.unit}` : ''}` })),
    ],
    items: [{ item: wo.title, qty: wo.qty, unit: wo.unit }],
    checklist: [...new Set([...trade.checklist, ...trade.finalChecklist])],
    documents: docs.filter((d) => d.kind === 'link' || d.uploaded).map((d) => ({ name: d.name, url: d.kind === 'link' ? (d.url ?? '#') : `/api/production-docs/${d.id}` })),
  };
}

/** Sends a finished work order to QC, or marks it ready to dispatch when there is no Quality portal. */
export async function sendToQualityOrComplete(tx: Tx, ctx: ActionContext, wo: Wo, reason: string) {
  if (await qualityOn(tx, ctx.companyId)) {
    await tx.update(prodWorkOrders).set({ status: 'final_qc', returnedNote: null, updatedAt: new Date() }).where(eq(prodWorkOrders.id, wo.id));
    const ir = await requestInspection(tx, ctx, await qcRequestFor(tx, wo));
    await logEvent(tx, ctx, wo.id, `${reason} Sent to QC for inspection (${ir.number}).`, 'production.wo.final_qc');
  } else {
    await tx.update(prodWorkOrders).set({ status: 'completed', completedAt: new Date(), returnedNote: null, updatedAt: new Date() }).where(eq(prodWorkOrders.id, wo.id));
    await logEvent(tx, ctx, wo.id, `${reason} Ready to dispatch.`, 'production.wo.complete');
  }
}

/** Moves the work order on when its operations change: all done means QC (or ready to dispatch). */
export async function afterOpsChange(tx: Tx, ctx: ActionContext, workOrderId: string) {
  const [wo] = await tx.select().from(prodWorkOrders).where(eq(prodWorkOrders.id, workOrderId));
  if (!wo || !['released', 'in_progress'].includes(wo.status)) return;
  const ops = await tx.select({ status: prodOperations.status }).from(prodOperations).where(eq(prodOperations.workOrderId, workOrderId));
  if (!ops.length || ops.some((o) => o.status !== 'done')) return;
  await sendToQualityOrComplete(tx, ctx, wo, 'All operations done.');
}

/** QC's final result (QC manager approved the report). Pass: ready to dispatch. Fail: back to the floor for rework. */
export async function onQualityResult(tx: Tx, ctx: ActionContext, d: QualityDecision) {
  const wo = await lockWo(tx, ctx, d.sourceId);
  if (wo.status !== 'final_qc') {
    await logEvent(tx, ctx, wo.id, `QC result ${d.number}: ${d.result.toUpperCase()} (work order already moved on)`);
    return;
  }
  if (d.result === 'pass') {
    await tx.update(prodWorkOrders).set({ status: 'completed', completedAt: new Date(), returnedNote: null, updatedAt: new Date() }).where(eq(prodWorkOrders.id, wo.id));
    await logEvent(tx, ctx, wo.id, `QC passed (${d.number})${d.remarks ? `: ${d.remarks}` : ''}. Ready to dispatch.`, 'production.qc.pass');
    return;
  }
  const note = `QC failed (${d.number}): ${d.ncr ?? 'non-conformance'}`;
  await tx.update(prodWorkOrders).set({ status: 'in_progress', returnedNote: note, updatedAt: new Date() }).where(eq(prodWorkOrders.id, wo.id));
  await logEvent(tx, ctx, wo.id, `${note}. Back to the shop floor for rework.`, 'production.qc.fail');
}
