import { and, eq, inArray } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { prodMaterials, prodMatRequests, prodOperations, prodWorkOrders, type Tx } from '@orbit/db';
import { OPEN_STATUSES, type ProdRole } from '../config';
import { productionTeam } from './admin';
import { myRole, notReady, today } from './shared';

// What is waiting for the signed-in person, by production role (menu badge and notifications).

export interface QueueItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  urgent?: boolean;
}

const woHref = (id: string) => `/production/order?id=${id}`;

async function build(tx: Tx, ctx: SessionContext): Promise<QueueItem[]> {
  const me = await myRole(tx, ctx);
  // A production admin gets only the tasks of the roles they cover (Production settings).
  const covers: ProdRole[] = me === 'admin' ? ((await productionTeam(tx, ctx)).find((p) => p.membershipId === ctx.membershipId)?.covers ?? []) : [me];
  const acts = (...r: ProdRole[]) => r.some((x) => covers.includes(x));
  const items: QueueItem[] = [];
  // Material requests: store issues or asks Purchase; engineer then manager approve buying.
  const mrs = await mrItems(tx, ctx, acts);
  items.push(...mrs);
  const wos = await tx.select().from(prodWorkOrders).where(and(eq(prodWorkOrders.companyId, ctx.companyId), inArray(prodWorkOrders.status, [...OPEN_STATUSES, 'completed'])));
  if (!wos.length) return items;
  const ids = wos.map((w) => w.id);
  const ops = await tx.select().from(prodOperations).where(inArray(prodOperations.workOrderId, ids));
  const urgent = (w: (typeof wos)[number]) => w.priority === 'urgent' || (!!w.due && w.due < today());

  if (acts('engineer')) {
    for (const w of wos.filter((x) => x.status === 'draft' && (x.returnedNote || x.createdBy === ctx.membershipId)))
      items.push({ id: `pd:${w.id}`, title: w.returnedNote ? `${w.number} sent back: change the plan` : `Finish planning ${w.number}`, detail: w.returnedNote ?? w.title, href: woHref(w.id), urgent: !!w.returnedNote });
  }
  if (acts('manager')) {
    for (const w of wos.filter((x) => x.status === 'pending_release')) items.push({ id: `pr:${w.id}`, title: `Release ${w.number}`, detail: `${w.title} · ${w.qty} ${w.unit}${w.due ? ` · due ${w.due}` : ''}`, href: woHref(w.id), urgent: urgent(w) });
  }
  if (acts('supervisor')) {
    for (const w of wos.filter((x) => x.status === 'released' || x.status === 'in_progress')) {
      const mine = ops.filter((o) => o.workOrderId === w.id);
      if (w.status === 'in_progress' && w.returnedNote && mine.every((o) => o.status === 'done')) items.push({ id: `fr:${w.id}`, title: `Rework ${w.number}: QC failed it`, detail: w.returnedNote.slice(0, 140), href: woHref(w.id), urgent: true });
      else if (mine.some((o) => o.status === 'pending' || o.status === 'running')) items.push({ id: `fl:${w.id}`, title: `Report output: ${w.number}`, detail: `${w.title}${w.due ? ` · due ${w.due}` : ''}`, href: '/production/report', urgent: urgent(w) });
    }
  }
  if (acts('store')) {
    const mats = await tx.select().from(prodMaterials).where(inArray(prodMaterials.workOrderId, ids));
    for (const w of wos.filter((x) => ['released', 'in_progress'].includes(x.status))) {
      const short = mats.filter((m) => m.workOrderId === w.id && m.issuedQty < m.qty - 1e-9);
      if (short.length) items.push({ id: `is:${w.id}`, title: `Issue material: ${w.number}`, detail: short.map((m) => m.item).slice(0, 3).join(', '), href: woHref(w.id), urgent: urgent(w) });
    }
    for (const w of wos.filter((x) => x.status === 'completed')) items.push({ id: `ds:${w.id}`, title: `Dispatch ${w.number}`, detail: `${w.title} · QC passed`, href: woHref(w.id) });
  }
  return items;
}

async function mrItems(tx: Tx, ctx: SessionContext, acts: (...r: ProdRole[]) => boolean): Promise<QueueItem[]> {
  try {
    return await tx.transaction(async (sp) => {
      const rows = await sp
        .select({ m: prodMatRequests, wo: prodWorkOrders.number })
        .from(prodMatRequests)
        .innerJoin(prodWorkOrders, eq(prodWorkOrders.id, prodMatRequests.workOrderId))
        .where(and(eq(prodMatRequests.companyId, ctx.companyId), inArray(prodMatRequests.status, ['store', 'ready', 'engineer', 'manager'])));
      const what = (m: typeof prodMatRequests.$inferSelect) => m.lines.map((l) => l.item).slice(0, 3).join(', ');
      const href = (id: string) => `/production/mr?id=${id}`;
      const out: QueueItem[] = [];
      for (const { m, wo } of rows) {
        if ((m.status === 'store' || m.status === 'ready') && acts('store'))
          out.push({ id: `mr:${m.id}`, title: m.status === 'ready' ? `Issue ${m.number} to ${wo}: material arrived` : `${m.returnNote ? 'Sent back: ' : ''}Material request ${m.number} for ${wo}`, detail: m.returnNote ?? what(m), href: href(m.id), urgent: !!m.returnNote });
        if (m.status === 'engineer' && acts('engineer')) out.push({ id: `me:${m.id}`, title: `Approve buying for ${m.number} (${wo})`, detail: what(m), href: href(m.id) });
        if (m.status === 'manager' && acts('manager')) out.push({ id: `mm:${m.id}`, title: `Approve ${m.number} (${wo}) for Purchase`, detail: what(m), href: href(m.id) });
      }
      return out;
    });
  } catch {
    return []; // migration 0027 not run yet
  }
}

/** Items waiting for this person; empty before migration 0023. */
export async function myQueue(tx: Tx, ctx: SessionContext): Promise<QueueItem[]> {
  try {
    return await tx.transaction((sp) => build(sp, ctx));
  } catch (err) {
    if (notReady(err)) return [];
    throw err;
  }
}
export const countMyQueue = async (tx: Tx, ctx: SessionContext) => (await myQueue(tx, ctx)).length;
