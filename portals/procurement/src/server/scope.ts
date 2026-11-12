import { eq, inArray } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { ownProjects, projectScope, type ProjectScope } from '@orbit/core/teams';
import { prodMatRequests, prodWorkOrders, procRequests, salesOrders, type Tx } from '@orbit/db';
import { originOf } from '../config';

// Project teams in Purchase: a request for a project (sales order) with a team is seen only by the
// team, the GM and company admins. A request knows its project from the project picked when it was
// raised, or, when Production raised it, from the material request's work order.

/** The sales order of each request (null when it is not for a project). */
async function ordersOf(tx: Tx, rows: { id: string; header: unknown }[]) {
  const out = new Map<string, string | null>();
  const fromMr = new Map<string, string>(); // request -> material request
  for (const r of rows) {
    const h = r.header as { _order?: string; _project?: string } | null;
    if (h?._order || h?._project) out.set(r.id, (h._order ?? h._project)!);
    else {
      const o = originOf(r.header);
      if (o) fromMr.set(r.id, o.id);
      else out.set(r.id, null);
    }
  }
  if (fromMr.size) {
    const mrs = await tx
      .select({ id: prodMatRequests.id, order: prodWorkOrders.salesOrderId, fields: prodWorkOrders.fields })
      .from(prodMatRequests)
      .innerJoin(prodWorkOrders, eq(prodWorkOrders.id, prodMatRequests.workOrderId))
      .where(inArray(prodMatRequests.id, [...fromMr.values()]))
      .catch(() => []);
    const byMr = new Map(mrs.map((m) => [m.id, m.order ?? ((m.fields as { _project?: string } | null)?._project || null)]));
    for (const [req, mr] of fromMr) out.set(req, byMr.get(mr) ?? null);
  }
  return out;
}

/** Request ids this person may not see. Empty when they see every project. */
export async function hiddenIds(tx: Tx, ctx: SessionContext, scope?: ProjectScope): Promise<Set<string>> {
  const s = scope ?? (await projectScope(tx, ctx));
  if (s.all) return new Set();
  const rows = await tx.select({ id: procRequests.id, header: procRequests.header }).from(procRequests).where(eq(procRequests.companyId, ctx.companyId));
  const orders = await ordersOf(tx, rows);
  return new Set(rows.filter((r) => !s.sees(orders.get(r.id))).map((r) => r.id));
}

/** A company project (no Sales portal) by its list label "CODE name", if this person may see it. */
export async function ownProjectByLabel(tx: Tx, ctx: SessionContext, label: string) {
  const s = await projectScope(tx, ctx);
  const rows = await ownProjects(tx, ctx.companyId).catch(() => []);
  return rows.find((p) => `${p.code} ${p.name}` === label && s.sees(p.id)) ?? null;
}

/** Projects from Sales (won orders) this person may raise a request for: "SO-1001 Platform P-7". */
export async function salesProjects(tx: Tx, ctx: SessionContext) {
  const s = await projectScope(tx, ctx);
  const rows = await tx.select({ id: salesOrders.id, number: salesOrders.number, title: salesOrders.title }).from(salesOrders).where(eq(salesOrders.companyId, ctx.companyId)).catch(() => []);
  return rows.filter((r) => s.sees(r.id)).map((r) => ({ id: r.id, label: `${r.number} ${r.title}` }));
}
