import { eq } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { projectScope } from '@orbit/core/teams';
import { salesOrders, type Tx } from '@orbit/db';

// Project teams in Sales: an order (project) with a team, and the enquiry it came from, are seen
// only by its team, the GM and company admins.

/** Ids (orders and their enquiries) this person may not see. Empty when they see every project. */
export async function hiddenIds(tx: Tx, ctx: SessionContext): Promise<Set<string>> {
  const scope = await projectScope(tx, ctx);
  if (scope.all) return new Set();
  const orders = await tx.select({ id: salesOrders.id, enquiryId: salesOrders.enquiryId }).from(salesOrders).where(eq(salesOrders.companyId, ctx.companyId));
  const hidden = new Set<string>();
  for (const o of orders.filter((x) => !scope.sees(x.id))) {
    hidden.add(o.id);
    if (o.enquiryId) hidden.add(o.enquiryId);
  }
  return hidden;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
/** Drops task-list items about records this person may not see (their ids are in the item id). */
export const visibleItems = <T extends { id: string }>(items: T[], hidden: Set<string>) => (hidden.size ? items.filter((i) => !(i.id.match(UUID) ?? []).some((u) => hidden.has(u))) : items);
