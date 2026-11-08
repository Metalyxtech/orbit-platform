import { and, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { salesCustomers, salesEnquiries, salesInvoices, salesLines, salesOrders, type Tx } from '@orbit/db';
import { DEFAULT_ADMIN_COVERS, fmtShort, OPEN_STAGES, quoteTotals, type SalesRole } from '../config';
import { loadConfig, myRole, notReady, today } from './shared';

// What is waiting for the signed-in person, by sales role (menu badge and notification pop-up).

export interface QueueItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  urgent?: boolean;
}

const enquiryHref = (id: string) => `/sales/enquiry?id=${id}`;

async function build(tx: Tx, ctx: SessionContext): Promise<QueueItem[]> {
  const me = await myRole(tx, ctx);
  const cfg = await loadConfig(tx, ctx.companyId);
  // A sales admin's task list follows the jobs the company admin chose for them (e.g. accounts).
  const covers: SalesRole[] = me === 'admin' ? (cfg.adminCovers[ctx.membershipId] ?? DEFAULT_ADMIN_COVERS) : [me];
  const acts = (...roles: SalesRole[]) => roles.some((r) => covers.includes(r));
  const t0 = today();
  const items: QueueItem[] = [];
  const enq = (where: Parameters<typeof and>[number]) =>
    tx
      .select({ e: salesEnquiries, customer: salesCustomers.name })
      .from(salesEnquiries)
      .innerJoin(salesCustomers, eq(salesCustomers.id, salesEnquiries.customerId))
      .where(and(eq(salesEnquiries.companyId, ctx.companyId), where))
      .limit(200);

  if (me === 'exec' || me === 'manager' || me === 'admin') {
    // My follow-ups due, quotations sent back or approved and ready to send.
    const mine = await enq(
      and(
        eq(salesEnquiries.ownerId, ctx.membershipId),
        inArray(salesEnquiries.stage, OPEN_STAGES),
        or(lte(salesEnquiries.followUp, t0), inArray(salesEnquiries.quoteStatus, ['approved', 'rejected'])),
      ),
    );
    for (const { e, customer } of mine) {
      if (e.quoteStatus === 'approved') items.push({ id: `sa:${e.id}`, title: `Send ${e.quoteNo}`, detail: `${customer} · approved, ready to send`, href: enquiryHref(e.id) });
      else if (e.quoteStatus === 'rejected') items.push({ id: `sr:${e.id}`, title: `${e.quoteNo} sent back`, detail: `${customer} · change the discount or rates`, href: enquiryHref(e.id), urgent: true });
      else if (e.followUp) items.push({ id: `sf:${e.id}`, title: `Follow up ${e.number}`, detail: `${customer} · ${e.followUp < t0 ? 'overdue' : 'today'}`, href: enquiryHref(e.id), urgent: e.followUp < t0 });
    }
  }
  if (acts('estimator')) {
    for (const { e, customer } of await enq(and(eq(salesEnquiries.stage, 'costing'), isNull(salesEnquiries.pricingDoneAt)))) {
      items.push({ id: `sc:${e.id}`, title: `Cost ${e.number}`, detail: `${customer} · ${e.title}`, href: enquiryHref(e.id) });
    }
  }
  // Approval chain: the sales manager approves first, then the GM gives final approval.
  if (acts('manager', 'gm')) {
    const steps = [...(acts('manager') ? ['pending'] : []), ...(acts('gm') ? ['pending_gm'] : [])];
    const waiting = await enq(inArray(salesEnquiries.quoteStatus, steps));
    if (waiting.length) {
      const lines = await tx.select().from(salesLines).where(inArray(salesLines.enquiryId, waiting.map((p) => p.e.id)));
      for (const { e, customer } of waiting) {
        const t = quoteTotals(lines.filter((l) => l.enquiryId === e.id), e.discount, cfg.gst);
        const gmStep = e.quoteStatus === 'pending_gm';
        items.push({ id: `sp:${e.id}:${e.quoteStatus}`, title: `${gmStep ? 'Final approval' : 'Approve'} ${e.quoteNo}`, detail: `${customer} · ${e.discount}% discount · ${fmtShort(cfg.currency, t.net)}${gmStep ? ' · sales manager approved' : ''}`, href: enquiryHref(e.id), urgent: true });
      }
    }
    if (acts('manager')) {
      const awaiting = await tx.select({ id: salesOrders.id, number: salesOrders.number, title: salesOrders.title }).from(salesOrders).where(and(eq(salesOrders.companyId, ctx.companyId), eq(salesOrders.status, 'awaiting')));
      for (const o of awaiting) items.push({ id: `so:${o.id}`, title: `Confirm ${o.number}`, detail: o.title, href: '/sales/orders' });
    }
  }
  if (acts('accounts')) {
    const toBill = await tx.select({ id: salesOrders.id, number: salesOrders.number, title: salesOrders.title }).from(salesOrders).where(and(eq(salesOrders.companyId, ctx.companyId), eq(salesOrders.status, 'dispatched')));
    for (const o of toBill) items.push({ id: `si:${o.id}`, title: `Invoice ${o.number}`, detail: `${o.title} · dispatched`, href: '/sales/orders' });
    const due = await tx.select({ id: salesInvoices.id, number: salesInvoices.number, amount: salesInvoices.amount, paid: salesInvoices.paid, due: salesInvoices.due }).from(salesInvoices).where(and(eq(salesInvoices.companyId, ctx.companyId), lte(salesInvoices.due, t0)));
    for (const i of due.filter((x) => x.amount - x.paid > 0.5 && x.due < t0)) items.push({ id: `sd:${i.id}`, title: `Collect ${i.number}`, detail: `overdue since ${i.due}`, href: '/sales/invoices', urgent: true });
  }
  return items;
}

/** Items waiting for this person; empty before migration 0019. */
export async function myQueue(tx: Tx, ctx: SessionContext): Promise<QueueItem[]> {
  try {
    return await tx.transaction((sp) => build(sp, ctx));
  } catch (err) {
    if (notReady(err)) return [];
    throw err;
  }
}
export const countMyQueue = async (tx: Tx, ctx: SessionContext) => (await myQueue(tx, ctx)).length;
