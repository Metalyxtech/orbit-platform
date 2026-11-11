import { eq } from 'drizzle-orm';
import type { ActionContext } from '@orbit/core';
import { prodOperations, prodWorkOrders, type Tx } from '@orbit/db';
import { loadConfig, logEvent } from './shared';

// Moves the work order on when its operations change: all operations done means final QC (or
// ready to dispatch when the company does not use a final inspection). Used by floor.ts and
// quality.ts, so neither imports the other.

export async function afterOpsChange(tx: Tx, ctx: ActionContext, workOrderId: string) {
  const [wo] = await tx.select({ id: prodWorkOrders.id, status: prodWorkOrders.status }).from(prodWorkOrders).where(eq(prodWorkOrders.id, workOrderId));
  if (!wo || !['released', 'in_progress'].includes(wo.status)) return;
  const ops = await tx.select({ status: prodOperations.status }).from(prodOperations).where(eq(prodOperations.workOrderId, workOrderId));
  if (!ops.length || ops.some((o) => o.status !== 'done')) return;
  const cfg = await loadConfig(tx, ctx.companyId);
  if (cfg.requireFinalQc) {
    await tx.update(prodWorkOrders).set({ status: 'final_qc', updatedAt: new Date() }).where(eq(prodWorkOrders.id, workOrderId));
    await logEvent(tx, ctx, workOrderId, 'All operations done. Waiting for the final QC inspection.', 'production.wo.final_qc');
  } else {
    await tx.update(prodWorkOrders).set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() }).where(eq(prodWorkOrders.id, workOrderId));
    await logEvent(tx, ctx, workOrderId, 'All operations done. Ready to dispatch.', 'production.wo.complete');
  }
}
