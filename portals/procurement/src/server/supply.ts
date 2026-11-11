import { and, eq, sql } from 'drizzle-orm';
import { audit, type ActionContext } from '@orbit/core';
import { assertNotHeld } from '@orbit/core/holds';
import type { SupplyDelivery, SupplyRequest } from '@orbit/core/supply';
import { procItems, procLines, procRequests, type Tx } from '@orbit/db';
import { stageLabel, type RequestOrigin, type Stage } from '../config';
import { estValue } from '../engine';
import { advance, linesOf, lockRequest, log, receiveGoods } from './requests';
import { loadConfig, moneyText, nextNumber, today } from './shared';

// Purchase's side of @orbit/core/supply: material requests approved in Production arrive here as
// purchase requests. The purchase engineer or purchase store keeper matches them with the main
// store (issue from stock), or they go through approval and buying like any other request.

/** Creates the purchase request for an approved production material request. */
export async function raiseFromProduction(tx: Tx, ctx: ActionContext, req: SupplyRequest) {
  const cfg = await loadConfig(tx, ctx.companyId);
  const number = await nextNumber(tx, ctx.companyId, 'pr', cfg);
  const origin: RequestOrigin = { portal: req.source, id: req.sourceId, ref: req.sourceRef, workOrder: req.workOrder };
  const needBy = req.needBy >= today(ctx) ? req.needBy : today(ctx);
  const [r] = await tx
    .insert(procRequests)
    .values({ companyId: ctx.companyId, number, title: req.title, project: req.project, needBy, priority: req.priority, requesterId: ctx.membershipId, stage: 'draft', header: { _from: origin } })
    .returning();
  // Match lines with the main store by item name, so the stock check can reserve them.
  const lines = [];
  for (const [i, l] of req.lines.entries()) {
    const [it] = await tx
      .select({ id: procItems.id, avgCost: procItems.avgCost })
      .from(procItems)
      .where(and(eq(procItems.companyId, ctx.companyId), eq(procItems.active, true), sql`lower(${procItems.name}) = lower(${l.description})`))
      .limit(1);
    lines.push({ companyId: ctx.companyId, requestId: r.id, sort: i, itemId: it?.id ?? null, description: l.description, qty: l.qty, unit: l.unit, estRate: it?.avgCost ?? 0, values: {} });
  }
  await tx.insert(procLines).values(lines);
  await log(tx, ctx, r, `Raised from Production ${req.sourceRef} for ${req.workOrder}${req.note ? `: ${req.note}` : ''} (${moneyText(cfg, estValue(await linesOf(tx, r.id)))} estimated)`);
  await advance(tx, ctx, cfg, r);
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'procurement.request.create', entity: 'proc_requests', entityId: r.id, data: { number, summary: [`${number} raised from Production ${req.sourceRef} (${req.workOrder})`] }, requestId: ctx.requestId });
  return { id: r.id, number };
}

/** The production store records goods delivered to the shop floor for a request it raised. */
export async function deliverFromProduction(tx: Tx, ctx: ActionContext, d: SupplyDelivery) {
  const r = await lockRequest(tx, ctx, d.purchaseId);
  await assertNotHeld(tx, ctx.companyId, 'proc_request', r.id, r.number);
  const origin = (r.header as { _from?: RequestOrigin })._from;
  if (!origin) throw new Error('This purchase was not raised by Production');
  if (r.stage !== 'receiving') throw new Error(`Purchase ${r.number} is at ${stageLabel(await loadConfig(tx, ctx.companyId), r.stage as Stage)}, not waiting for delivery`);
  const cfg = await loadConfig(tx, ctx.companyId);
  const lines = await linesOf(tx, r.id);
  await receiveGoods(tx, ctx, cfg, r, lines, { id: r.id, deliveryNote: d.deliveryNote, condition: d.condition, docsOk: d.docsOk, extra: {}, qty: d.qty, intoStock: false, receivedAt: 'production' });
  return { ref: r.poNo ?? r.number };
}

/** Where a purchase raised for production stands. */
export async function supplyStatus(tx: Tx, companyId: string, purchaseId: string) {
  const [r] = await tx.select().from(procRequests).where(and(eq(procRequests.id, purchaseId), eq(procRequests.companyId, companyId)));
  if (!r) return null;
  const cfg = await loadConfig(tx, companyId);
  const lines = await linesOf(tx, r.id);
  return {
    number: r.number,
    stage: r.stage,
    stageLabel: stageLabel(cfg, r.stage as Stage),
    poNo: r.poNo,
    receiving: r.stage === 'receiving',
    lines: lines.map((l) => ({ description: l.description, qty: l.qty, unit: l.unit })),
  };
}
