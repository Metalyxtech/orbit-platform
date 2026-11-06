import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { billingEvents, billingPlans, companies, companyPortals, companySubscriptions, memberships, type Tx } from '@orbit/db';
import { PLANS, TRIAL_DAYS, TRIAL_LIMITS, planById, priceOf, type Cycle, type PlanId } from './plans';
import * as rz from './razorpay';

const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
/** Migration 0011 not run yet: every company is on the free trial. */
const missing = (err: unknown) => pgCode(err) === '42P01' || /relation "(company_subscriptions|billing_\w+)" does not exist/.test(String(err));

const DAY = 864e5;
const PAID = ['active', 'authenticated'];

export type BillingStatus = 'trial' | 'trial_ended' | 'active' | 'past_due' | 'cancelled' | 'pending_payment';

/** The company's plan, status, limits and usage. Never throws for a missing table. */
export async function billingState(tx: Tx, ctx: SessionContext) {
  const [company] = await tx.select({ createdAt: companies.createdAt }).from(companies).where(eq(companies.id, ctx.companyId));
  let sub: typeof companySubscriptions.$inferSelect | undefined;
  try {
    [sub] = await tx.transaction((sp) => sp.select().from(companySubscriptions).where(eq(companySubscriptions.companyId, ctx.companyId)));
  } catch (err) {
    if (!missing(err)) throw err;
  }
  const now = Date.now();
  const trialEnds = sub?.trialEndsAt ?? new Date((company?.createdAt ?? new Date()).getTime() + TRIAL_DAYS * DAY);
  const periodEnd = sub?.currentPeriodEnd ?? null;
  const plan = sub ? planById(sub.plan) : undefined;
  let status: BillingStatus;
  if (sub && PAID.includes(sub.status) && (!periodEnd || periodEnd.getTime() > now - 3 * DAY)) status = 'active';
  else if (sub && (sub.status === 'pending' || sub.status === 'halted')) status = 'past_due';
  else if (sub && sub.status === 'cancelled' && periodEnd && periodEnd.getTime() > now) status = 'active';
  else if (sub && sub.status === 'created') status = trialEnds.getTime() > now ? 'trial' : 'pending_payment';
  else if (sub && (sub.status === 'cancelled' || sub.status === 'completed')) status = 'cancelled';
  else status = trialEnds.getTime() > now ? 'trial' : 'trial_ended';
  const onPlan = status === 'active' || status === 'past_due';
  const limits = onPlan && plan ? { users: plan.users, portals: plan.portals } : TRIAL_LIMITS;
  const [users, portals] = await Promise.all([
    tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.status, 'active'))),
    tx.select({ p: companyPortals.portal }).from(companyPortals).where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.enabled, true))),
  ]);
  return {
    status,
    plan: plan?.id ?? null,
    cycle: (sub?.cycle as Cycle | undefined) ?? null,
    razorpayStatus: sub?.status ?? null,
    trialEndsAt: trialEnds.toISOString(),
    trialDaysLeft: Math.max(0, Math.ceil((trialEnds.getTime() - now) / DAY)),
    currentPeriodEnd: periodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    limits,
    usage: { users: users.length, portals: portals.length },
    /** Can the company keep adding people and portals? */
    usable: status === 'trial' || status === 'active' || status === 'past_due',
  };
}
export type BillingState = Awaited<ReturnType<typeof billingState>>;

/** Throws when adding one more person or portal would go over the plan. */
export async function assertWithinPlan(tx: Tx, ctx: SessionContext, what: 'user' | 'portal') {
  const s = await billingState(tx, ctx);
  if (!s.usable) throw new Error('Your Orbit plan has ended. Choose a plan in Plan and billing to keep adding people and portals.');
  const used = what === 'user' ? s.usage.users : s.usage.portals;
  const cap = what === 'user' ? s.limits.users : s.limits.portals;
  if (used >= cap) throw new Error(`Your plan includes ${cap} ${what === 'user' ? 'people' : cap === 1 ? 'portal' : 'portals'}. Upgrade in Plan and billing to add more.`);
}

const requireAdmin = (ctx: SessionContext) => {
  if (ctx.role !== 'company_admin') throw new Error('Only the company admin can manage the subscription');
};

/** The Razorpay plan for a plan and cycle, created on first use. */
async function razorpayPlanId(tx: Tx, id: PlanId, cycle: Cycle) {
  const key = `${id}_${cycle}`;
  const p = planById(id)!;
  const amount = priceOf(p, cycle) * 100;
  const [row] = await tx.select().from(billingPlans).where(eq(billingPlans.key, key));
  if (row && row.amount === amount) return row.razorpayPlanId;
  const created = await rz.createPlan({ period: cycle, name: `Orbit ${p.name} (${cycle})`, amount, description: p.tagline });
  await tx
    .insert(billingPlans)
    .values({ key, razorpayPlanId: created.id, amount })
    .onConflictDoUpdate({ target: billingPlans.key, set: { razorpayPlanId: created.id, amount } });
  return created.id;
}

const startInput = z.object({ plan: z.enum(PLANS.map((p) => p.id) as [PlanId, ...PlanId[]]), cycle: z.enum(['monthly', 'yearly']) });

/** Creates the Razorpay subscription; the browser then opens Razorpay Checkout with its id. */
export async function startCheckout(tx: Tx, ctx: ActionContext, raw: z.input<typeof startInput>) {
  requireAdmin(ctx);
  const input = startInput.parse(raw);
  const state = await billingState(tx, ctx);
  const plan = planById(input.plan)!;
  if (state.usage.users > plan.users) throw new Error(`${plan.name} includes ${plan.users} people and you have ${state.usage.users}. Pick a larger plan.`);
  if (state.status === 'active' && !state.cancelAtPeriodEnd && state.plan === input.plan && state.cycle === input.cycle) throw new Error('You are already on this plan.');
  const planId = await razorpayPlanId(tx, input.plan, input.cycle);
  // Trial days left are honoured: the first charge happens when the trial ends.
  const startAt = state.status === 'trial' && state.trialDaysLeft > 0 ? Math.floor(new Date(state.trialEndsAt).getTime() / 1000) : undefined;
  const sub = await rz.createSubscription({
    planId,
    totalCount: input.cycle === 'yearly' ? 10 : 120,
    notes: { company_id: ctx.companyId, company: ctx.companyName, plan: input.plan, cycle: input.cycle },
    startAt,
  });
  await tx
    .insert(companySubscriptions)
    .values({ companyId: ctx.companyId, plan: input.plan, cycle: input.cycle, status: 'created', razorpaySubscriptionId: sub.id, trialEndsAt: new Date(state.trialEndsAt) })
    .onConflictDoUpdate({
      target: companySubscriptions.companyId,
      set: { plan: input.plan, cycle: input.cycle, status: 'created', razorpaySubscriptionId: sub.id, cancelAtPeriodEnd: false, updatedAt: new Date() },
    });
  await tx.insert(billingEvents).values({ companyId: ctx.companyId, type: 'checkout.started', razorpayId: sub.id, amount: priceOf(plan, input.cycle) * 100, data: { plan: input.plan, cycle: input.cycle } });
  return { subscriptionId: sub.id, keyId: await rz.publicKeyId(), planName: plan.name, amount: priceOf(plan, input.cycle), cycle: input.cycle, email: ctx.email, name: ctx.name };
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
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'billing.subscribe', entity: 'company_subscriptions', entityId: ctx.companyId, data: { summary: [`Subscribed to ${planById(sub.plan)?.name} (${sub.cycle})`] }, requestId: ctx.requestId });
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
