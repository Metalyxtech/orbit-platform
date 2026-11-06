import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { billingEvents, billingPlans, companies, companyBilling, companyPortals, companySubscriptions, memberships, type Tx } from '@orbit/db';
import {
  BILLING_LAUNCH,
  BUNDLES,
  CYCLES,
  TIERS,
  TRIAL_DAYS,
  TRIAL_LIMITS,
  cycleOf,
  planId,
  planOf,
  priceFor,
  type Bundle,
  type Currency,
  type Cycle,
  type TierId,
} from './plans';
import * as rz from './razorpay';

const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
/** Migrations 0011/0012 not run yet: every company is on the free trial. */
export const missing = (err: unknown) => pgCode(err) === '42P01' || /relation "(company_subscriptions|company_billing|billing_\w+)" does not exist/.test(String(err));

const DAY = 864e5;
const PAID = ['active', 'authenticated'];

export type BillingStatus = 'trial' | 'trial_ended' | 'active' | 'past_due' | 'cancelled' | 'pending_payment';

/** Orbit's billing settings for a company: currency, plans released or hidden, trial length. */
export async function billingSettings(tx: Tx, companyId: string): Promise<{ currency: Currency; showPlans: boolean; trialDays: number }> {
  try {
    const [row] = await tx.transaction((sp) => sp.select().from(companyBilling).where(eq(companyBilling.companyId, companyId)));
    return { currency: row?.currency === 'USD' ? 'USD' : 'INR', showPlans: row?.showPlans ?? true, trialDays: row?.trialDays ?? TRIAL_DAYS };
  } catch (err) {
    if (missing(err)) return { currency: 'INR', showPlans: true, trialDays: TRIAL_DAYS };
    throw err;
  }
}

/** The company's plan, status, limits and usage. Never throws for a missing table. */
export async function billingState(tx: Tx, ctx: Pick<SessionContext, 'companyId'>) {
  return billingStateFor(tx, ctx.companyId);
}

export async function billingStateFor(tx: Tx, companyId: string) {
  const [company] = await tx.select({ createdAt: companies.createdAt }).from(companies).where(eq(companies.id, companyId));
  let sub: typeof companySubscriptions.$inferSelect | undefined;
  try {
    [sub] = await tx.transaction((sp) => sp.select().from(companySubscriptions).where(eq(companySubscriptions.companyId, companyId)));
  } catch (err) {
    if (!missing(err)) throw err;
  }
  const settings = await billingSettings(tx, companyId);
  const now = Date.now();
  const trialStart = Math.max((company?.createdAt ?? new Date()).getTime(), new Date(BILLING_LAUNCH).getTime());
  const trialEnds = sub?.trialEndsAt ?? new Date(trialStart + settings.trialDays * DAY);
  const periodEnd = sub?.currentPeriodEnd ?? null;
  const plan = sub ? planOf(sub.plan) : undefined;
  let status: BillingStatus;
  if (sub && PAID.includes(sub.status) && (!periodEnd || periodEnd.getTime() > now - 3 * DAY)) status = 'active';
  else if (sub && (sub.status === 'pending' || sub.status === 'halted')) status = 'past_due';
  else if (sub && sub.status === 'cancelled' && periodEnd && periodEnd.getTime() > now) status = 'active';
  else if (sub && sub.status === 'created') status = trialEnds.getTime() > now ? 'trial' : 'pending_payment';
  else if (sub && (sub.status === 'cancelled' || sub.status === 'completed')) status = 'cancelled';
  else status = trialEnds.getTime() > now ? 'trial' : 'trial_ended';
  const onPlan = status === 'active' || status === 'past_due';
  const limits = onPlan && plan ? { users: plan.users, portals: plan.portals } : TRIAL_LIMITS;
  const [users, enabled] = await Promise.all([
    tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.companyId, companyId), eq(memberships.status, 'active'))),
    tx.select({ p: companyPortals.portal }).from(companyPortals).where(and(eq(companyPortals.companyId, companyId), eq(companyPortals.enabled, true))),
  ]);
  const portals = enabled.map((p) => p.p);
  return {
    status,
    currency: settings.currency,
    showPlans: settings.showPlans,
    trialDays: settings.trialDays,
    plan: plan?.id ?? null,
    planName: plan?.name ?? null,
    bundle: plan?.bundle ?? null,
    tier: plan?.tier ?? null,
    cycle: (sub?.cycle as Cycle | undefined) ?? null,
    razorpayStatus: sub?.status ?? null,
    trialEndsAt: trialEnds.toISOString(),
    trialDaysLeft: Math.max(0, Math.ceil((trialEnds.getTime() - now) / DAY)),
    currentPeriodEnd: periodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    limits,
    usage: { users: users.length, portals },
    /** Can the company keep adding people and portals? */
    usable: status === 'trial' || status === 'active' || status === 'past_due',
  };
}
export type BillingState = Awaited<ReturnType<typeof billingState>>;

/** Throws when adding one more person, or a portal outside the plan, is not allowed. */
export async function assertWithinPlan(tx: Tx, ctx: SessionContext, what: 'user' | 'portal', portal?: string) {
  const s = await billingState(tx, ctx);
  if (!s.usable) throw new Error('Your Orbit plan has ended. Choose a plan in Plan and billing to keep adding people and portals.');
  if (what === 'user' && s.usage.users >= s.limits.users) throw new Error(`Your plan includes ${s.limits.users} people. Upgrade in Plan and billing to add more.`);
  if (what === 'portal' && portal && !s.limits.portals.includes(portal)) {
    throw new Error(`Your ${s.planName ?? ''} plan does not include this portal. Switch to a plan with it in Plan and billing.`);
  }
}

const requireAdmin = (ctx: SessionContext) => {
  if (ctx.role !== 'company_admin') throw new Error('Only the company admin can manage the subscription');
};

/** The Razorpay plan for a bundle, tier and cycle, created on first use. */
async function razorpayPlanId(tx: Tx, b: Bundle, t: TierId, cycle: Cycle, currency: Currency) {
  const key = `${planId(b, t)}_${cycle}_${currency}`;
  const p = planOf(planId(b, t))!;
  const c = cycleOf(cycle);
  const amount = priceFor(b, t, cycle, currency) * 100; // paise or cents
  const [row] = await tx.select().from(billingPlans).where(eq(billingPlans.key, key));
  if (row && row.amount === amount) return row.razorpayPlanId;
  const created = await rz.createPlan({ period: c.rz.period, interval: c.rz.interval, name: `Orbit ${p.name} (${c.label})`, amount, currency, description: `Up to ${p.users} people` });
  await tx
    .insert(billingPlans)
    .values({ key, razorpayPlanId: created.id, amount })
    .onConflictDoUpdate({ target: billingPlans.key, set: { razorpayPlanId: created.id, amount } });
  return created.id;
}

const startInput = z.object({
  bundle: z.enum(BUNDLES.map((b) => b.id) as [Bundle, ...Bundle[]]),
  tier: z.enum(TIERS.map((t) => t.id) as [TierId, ...TierId[]]),
  cycle: z.enum(CYCLES.map((c) => c.id) as [Cycle, ...Cycle[]]),
});

/** Creates the Razorpay subscription; the browser then opens Razorpay Checkout with its id. */
export async function startCheckout(tx: Tx, ctx: ActionContext, raw: z.input<typeof startInput>) {
  requireAdmin(ctx);
  const input = startInput.parse(raw);
  const state = await billingState(tx, ctx);
  if (!state.showPlans) throw new Error('Your plan is arranged by the Orbit team. Contact Orbit to change it.');
  const currency = state.currency;
  const id = planId(input.bundle, input.tier);
  const plan = planOf(id)!;
  if (state.usage.users > plan.users) throw new Error(`${plan.name} includes ${plan.users} people and you have ${state.usage.users}. Pick a larger team size.`);
  const outside = state.usage.portals.filter((p) => !plan.portals.includes(p));
  if (outside.length) throw new Error(`Your company already uses ${outside.map((p) => (p === 'procurement' ? 'Purchase' : 'Timesheet')).join(' and ')}. Choose a plan that includes it, or Timesheet + Purchase.`);
  if (state.status === 'active' && !state.cancelAtPeriodEnd && state.plan === id && state.cycle === input.cycle) throw new Error('You are already on this plan.');
  const rzPlan = await razorpayPlanId(tx, input.bundle, input.tier, input.cycle, currency);
  // Trial days left are honoured: the first charge happens when the trial ends.
  const startAt = state.status === 'trial' && state.trialDaysLeft > 0 ? Math.floor(new Date(state.trialEndsAt).getTime() / 1000) : undefined;
  const sub = await rz.createSubscription({
    planId: rzPlan,
    totalCount: cycleOf(input.cycle).rz.totalCount,
    notes: { company_id: ctx.companyId, company: ctx.companyName, plan: id, cycle: input.cycle, currency },
    startAt,
  });
  await tx
    .insert(companySubscriptions)
    .values({ companyId: ctx.companyId, plan: id, cycle: input.cycle, status: 'created', razorpaySubscriptionId: sub.id, trialEndsAt: new Date(state.trialEndsAt) })
    .onConflictDoUpdate({
      target: companySubscriptions.companyId,
      set: { plan: id, cycle: input.cycle, status: 'created', razorpaySubscriptionId: sub.id, cancelAtPeriodEnd: false, updatedAt: new Date() },
    });
  const amount = priceFor(input.bundle, input.tier, input.cycle, currency);
  await tx.insert(billingEvents).values({ companyId: ctx.companyId, type: 'checkout.started', razorpayId: sub.id, amount: amount * 100, data: { plan: id, cycle: input.cycle, currency } });
  return { subscriptionId: sub.id, keyId: await rz.publicKeyId(), planName: plan.name, amount, currency, cycle: cycleOf(input.cycle).label, email: ctx.email, name: ctx.name };
}

const confirmInput = z.object({ paymentId: z.string().min(5).max(80), subscriptionId: z.string().min(5).max(80), signature: z.string().min(10).max(200) });

/** Checkout returned: verify the signature, then read the subscription from Razorpay. */
export async function confirmCheckout(tx: Tx, ctx: ActionContext, raw: z.input<typeof confirmInput>) {
  requireAdmin(ctx);
  const input = confirmInput.parse(raw);
  const [sub] = await tx.select().from(companySubscriptions).where(eq(companySubscriptions.companyId, ctx.companyId));
  if (!sub || sub.razorpaySubscriptionId !== input.subscriptionId) throw new Error('This payment is not for your company');
  if (!(await rz.verifyCheckoutSignature(input.paymentId, input.subscriptionId, input.signature))) throw new Error('The payment could not be verified. Nothing was charged twice; contact Orbit if money left your account.');
  const live = await rz.fetchSubscription(input.subscriptionId);
  await applyRazorpay(tx, ctx.companyId, live);
  await tx.insert(billingEvents).values({ companyId: ctx.companyId, type: 'checkout.completed', razorpayId: input.paymentId, data: { subscription: input.subscriptionId } });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'billing.subscribe', entity: 'company_subscriptions', entityId: ctx.companyId, data: { summary: [`Subscribed to ${planOf(sub.plan)?.name} (${cycleOf(sub.cycle).label})`] }, requestId: ctx.requestId });
  return { status: live.status };
}

/** Stores what Razorpay says about the subscription (checkout return and webhooks). */
export async function applyRazorpay(tx: Tx, companyId: string, live: rz.RzSubscription) {
  await tx
    .update(companySubscriptions)
    .set({
      status: live.status,
      currentPeriodEnd: live.current_end ? new Date(live.current_end * 1000) : live.charge_at ? new Date(live.charge_at * 1000) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(companySubscriptions.companyId, companyId), eq(companySubscriptions.razorpaySubscriptionId, live.id)));
}

export async function cancelPlan(tx: Tx, ctx: ActionContext) {
  requireAdmin(ctx);
  const [sub] = await tx.select().from(companySubscriptions).where(eq(companySubscriptions.companyId, ctx.companyId));
  if (!sub?.razorpaySubscriptionId || !PAID.includes(sub.status)) throw new Error('There is no active subscription to cancel');
  const live = await rz.cancelSubscription(sub.razorpaySubscriptionId, true);
  await tx.update(companySubscriptions).set({ cancelAtPeriodEnd: true, status: live.status === 'cancelled' ? 'cancelled' : sub.status, updatedAt: new Date() }).where(eq(companySubscriptions.companyId, ctx.companyId));
  await tx.insert(billingEvents).values({ companyId: ctx.companyId, type: 'subscription.cancel_requested', razorpayId: sub.razorpaySubscriptionId });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'billing.cancel', entity: 'company_subscriptions', entityId: ctx.companyId, data: { summary: ['Subscription set to end at the end of the paid period'] }, requestId: ctx.requestId });
  return { ok: true as const };
}

export async function billingHistory(tx: Tx, ctx: SessionContext) {
  requireAdmin(ctx);
  try {
    return await tx.transaction((sp) => sp.select().from(billingEvents).where(eq(billingEvents.companyId, ctx.companyId)).orderBy(desc(billingEvents.createdAt)).limit(50));
  } catch (err) {
    if (missing(err)) return [];
    throw err;
  }
}
