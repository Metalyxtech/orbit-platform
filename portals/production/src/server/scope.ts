import { eq, inArray } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { projectScope } from '@orbit/core/teams';
import { prodMatRequests, prodReceipts, prodWorkOrders, type Tx } from '@orbit/db';

// Project teams in Production: a work order made for a project (sales order) with a team, its
// material requests and its store receipts, are seen only by the team, the GM and company admins.

/** Ids (work orders, material requests, receipts) this person may not see. Empty when they see every project. */
export async function hiddenIds(tx: Tx, ctx: SessionContext): Promise<Set<string>> {
  const scope = await projectScope(tx, ctx);
  if (scope.all) return new Set();
  const wos = await tx.select({ id: prodWorkOrders.id, order: prodWorkOrders.salesOrderId }).from(prodWorkOrders).where(eq(prodWorkOrders.companyId, ctx.companyId));
  const hiddenWo = wos.filter((w) => !scope.sees(w.order)).map((w) => w.id);
  if (!hiddenWo.length) return new Set();
  const mrs = await tx.select({ id: prodMatRequests.id }).from(prodMatRequests).where(inArray(prodMatRequests.workOrderId, hiddenWo)).catch(() => []);
  const rcs = mrs.length ? await tx.select({ id: prodReceipts.id }).from(prodReceipts).where(inArray(prodReceipts.mrId, mrs.map((m) => m.id))).catch(() => []) : [];
  return new Set([...hiddenWo, ...mrs.map((m) => m.id), ...rcs.map((r) => r.id)]);
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
/** Drops task-list items about records this person may not see (their ids are in the item id or link). */
export const visibleItems = <T extends { id: string; href?: string }>(items: T[], hidden: Set<string>) =>
  hidden.size ? items.filter((i) => ![...(i.id.match(UUID) ?? []), ...((i.href ?? '').match(UUID) ?? [])].some((u) => hidden.has(u))) : items;
