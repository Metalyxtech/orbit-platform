import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext } from '@orbit/core';
import { customPlans, customRequests, type Tx } from '@orbit/db';
import { cycleOf, priceFor, type Cycle } from '../billing/plans';
import { billingStateFor } from '../billing/state';
import { getCustomPlan, customPrice } from './plan';

// Prices for custom work: Super Admin sends one combined price (normal portals + custom portal),
// monthly and/or yearly; the company admin approves it; when the work is ready the custom plan is
// switched on and the admin subscribes. A yearly plan already paid for gives a credit for the
// months not used, taken off the first yearly payment of the custom plan.

const DAY = 864e5;

/** What the company pays today, and what is left of the period it already paid for. */
export async function subscriptionSnapshot(tx: Tx, companyId: string) {
  const s = await billingStateFor(tx, companyId);
  const paid = s.status === 'active' || s.status === 'past_due';
  const custom = s.plan === 'custom' ? await getCustomPlan(tx, companyId) : null;
  const cycle = s.cycle as Cycle | null;
  const price =
    s.bundle && s.tier && cycle
      ? priceFor(s.bundle, s.tier, cycle, s.currency)
      : custom && (cycle === 'monthly' || cycle === 'yearly')
        ? customPrice(custom, cycle)
        : null;
  const months = cycle ? (custom ? (cycle === 'yearly' ? 12 : 1) : cycleOf(cycle).months) : 0;
  const end = s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null;
  const start = end && months ? new Date(new Date(end).setMonth(end.getMonth() - months)) : null;
  const totalDays = start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY)) : 0;
  const daysLeft = end ? Math.max(0, Math.min(totalDays, Math.ceil((end.getTime() - Date.now()) / DAY))) : 0;
  // Only a longer paid period (quarterly, half-yearly, yearly) is credited; monthly simply runs on.
  const unused = paid && price && totalDays && months > 1 ? Math.round((price * daysLeft) / totalDays) : 0;
  return {
    status: s.status,
    paid,
    planName: s.planName,
    cycle,
    cycleLabel: cycle ? (custom ? (cycle === 'yearly' ? 'Yearly' : 'Monthly') : cycleOf(cycle).label) : null,
    monthly: months === 1,
    price,
    currency: s.currency,
    periodStart: start?.toISOString() ?? null,
    periodEnd: end?.toISOString() ?? null,
    totalDays,
    daysLeft,
    daysUsed: totalDays - daysLeft,
    unused,
  };
}
export type SubscriptionSnapshot = Awaited<ReturnType<typeof subscriptionSnapshot>>;

const money = z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().positive().max(100_000_000).nullable());
const quoteInput = z
  .object({
    id: z.uuid(),
    label: z.string().trim().min(2, 'Name the plan').max(120),
    monthly: money,
    yearly: money,
    credit: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().int().min(0).max(100_000_000)),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.monthly || v.yearly, 'Enter a monthly or a yearly price')
  .refine((v) => !v.credit || v.yearly, 'A credit needs a yearly price (it is taken off the first yearly payment)');

/** Super Admin sends the price; the customer sees it on their Custom portals page with Approve / Decline. */
export async function sendQuote(tx: Tx, companyId: string, raw: z.input<typeof quoteInput>) {
  const v = quoteInput.parse(raw);
  const [row] = await tx
    .update(customRequests)
    .set({
      status: 'quoted',
      quoteLabel: v.label,
      quoteMonthly: v.monthly,
      quoteYearly: v.yearly,
      quoteCredit: v.credit,
      quoteNote: v.note || null,
      quotedAt: new Date(),
      decidedAt: null,
      decidedBy: null,
      quoteApproved: null,
      updatedAt: new Date(),
    })
    .where(and(eq(customRequests.id, v.id), eq(customRequests.companyId, companyId)))
    .returning({ title: customRequests.title });
  if (!row) throw new Error('Request not found');
  const parts = [v.monthly && `monthly ${v.monthly}`, v.yearly && `yearly ${v.yearly}`, v.credit && `credit ${v.credit}`].filter(Boolean).join(', ');
  await audit(tx, { companyId, actorId: null, action: 'custom.quote', entity: 'custom_requests', entityId: v.id, data: { summary: [`Price sent for "${row.title}": ${v.label}, ${parts}`] } });
}

/** The company admin approves or declines the price (it becomes their plan when the work is ready). */
export async function decideQuote(tx: Tx, ctx: ActionContext, raw: { id: string; approve: boolean }) {
  if (ctx.role !== 'company_admin') throw new Error('Only the company admin can approve the price');
  const id = z.uuid().parse(raw.id);
  const [r] = await tx.select().from(customRequests).where(and(eq(customRequests.id, id), eq(customRequests.companyId, ctx.companyId)));
  if (!r || r.status !== 'quoted') throw new Error('There is no price waiting for your approval on this request');
  const approve = !!raw.approve;
  await tx
    .update(customRequests)
    .set({ status: approve ? 'approved' : 'declined', quoteApproved: approve, decidedAt: new Date(), decidedBy: ctx.membershipId, updatedAt: new Date() })
    .where(eq(customRequests.id, id));
  await audit(tx, {
    companyId: ctx.companyId,
    actorId: ctx.membershipId,
    action: approve ? 'custom.approve' : 'custom.decline',
    entity: 'custom_requests',
    entityId: id,
    data: { summary: [`${approve ? 'Approved' : 'Declined'} the price for "${r.title}"`] },
    requestId: ctx.requestId,
  });
  return { approved: approve };
}

/** Work marked ready: the approved price becomes the company's custom plan, ready to subscribe. */
export async function activateApprovedPlan(tx: Tx, companyId: string, requestId: string) {
  const [r] = await tx.select().from(customRequests).where(and(eq(customRequests.id, requestId), eq(customRequests.companyId, companyId)));
  if (r?.quoteApproved !== true || !r.quoteLabel || (!r.quoteMonthly && !r.quoteYearly)) return false;
  const deal = { enabled: true, label: r.quoteLabel, monthlyPrice: r.quoteMonthly, yearlyPrice: r.quoteYearly, yearlyCredit: r.quoteCredit, creditUsedAt: null };
  await tx
    .insert(customPlans)
    .values({ companyId, ...deal })
    .onConflictDoUpdate({ target: customPlans.companyId, set: { ...deal, updatedAt: new Date() } });
  return true;
}
