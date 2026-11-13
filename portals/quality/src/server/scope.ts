import { eq, inArray } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { projectScope } from '@orbit/core/teams';
import { prodMatRequests, prodReceipts, prodWorkOrders, procRequests, qcInspections, type Tx } from '@orbit/db';

// Project teams in Quality: an inspection of a project's material or work (a sales order with a
// team) is seen only by the team, the GM and company admins.

/** Inspection ids this person may not see. Empty when they see every project. */
export async function hiddenIds(tx: Tx, ctx: SessionContext): Promise<Set<string>> {
  const scope = await projectScope(tx, ctx);
  if (scope.all) return new Set();
  const rows = await tx.select({ id: qcInspections.id, source: qcInspections.source, sourceId: qcInspections.sourceId }).from(qcInspections).where(eq(qcInspections.companyId, ctx.companyId));
  const ids = (s: string) => rows.filter((r) => r.source === s).map((r) => r.sourceId);
  const woOrder = new Map((await tx.select({ id: prodWorkOrders.id, order: prodWorkOrders.salesOrderId, fields: prodWorkOrders.fields }).from(prodWorkOrders).where(eq(prodWorkOrders.companyId, ctx.companyId)).catch(() => [])).map((w) => [w.id, w.order ?? ((w.fields as { _project?: string } | null)?._project || null)]));
  const mrWo = new Map((await tx.select({ id: prodMatRequests.id, wo: prodMatRequests.workOrderId }).from(prodMatRequests).where(eq(prodMatRequests.companyId, ctx.companyId)).catch(() => [])).map((m) => [m.id, m.wo]));
  const purchase = ids('purchase').length ? await tx.select({ id: procRequests.id, header: procRequests.header }).from(procRequests).where(inArray(procRequests.id, ids('purchase'))).catch(() => []) : [];
  const store = ids('store').length ? await tx.select({ id: prodReceipts.id, mr: prodReceipts.mrId }).from(prodReceipts).where(inArray(prodReceipts.id, ids('store'))).catch(() => []) : [];
  const viaMr = (mr: string | null | undefined) => (mr ? woOrder.get(mrWo.get(mr) ?? '') ?? null : null);
  const orderOf = new Map<string, string | null>();
  for (const p of purchase) {
    const h = p.header as { _order?: string; _project?: string; _from?: { id?: string } } | null;
    orderOf.set(p.id, h?._order ?? h?._project ?? viaMr(h?._from?.id));
  }
  for (const r of store) orderOf.set(r.id, viaMr(r.mr));
  return new Set(rows.filter((r) => !scope.sees(r.source === 'production' ? (woOrder.get(r.sourceId) ?? null) : (orderOf.get(r.sourceId) ?? null))).map((r) => r.id));
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
export const visibleItems = <T extends { id: string; href?: string }>(items: T[], hidden: Set<string>) =>
  hidden.size ? items.filter((i) => ![...(i.id.match(UUID) ?? []), ...((i.href ?? '').match(UUID) ?? [])].some((u) => hidden.has(u))) : items;
