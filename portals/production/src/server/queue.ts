import { and, eq, inArray } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { prodMaterials, prodOperations, prodWorkOrders, type Tx } from '@orbit/db';
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
  const wos = await tx.select().from(prodWorkOrders).where(and(eq(prodWorkOrders.companyId, ctx.companyId), inArray(prodWorkOrders.status, [...OPEN_STATUSES, 'completed'])));
  if (!wos.length) return items;
  const ids = wos.map((w) => w.id);
  const ops = await tx.select().from(prodOperations).where(inArray(prodOperations.workOrderId, ids));
  const urgent = (w: (typeof wos)[number]) => w.priority === 'urgent' || (!!w.due && w.due < today());

  if (acts('engineer')) {
    for (const w of wos.filter((x) => x.status === 'draft' && (x.returnedNote || x.createdBy === ctx.membershipId)))
      items.push({ id: `pd:${w.id}`, title: w.returnedNote ? `${w.number} sent back: change the plan` : `Finish planning ${w.number}`, detail: w.returnedNote ?? w.title, href: woHref(w.id), urgent: !!w.returnedNote });
  }
  if (acts('manager', 'gm')) {
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
