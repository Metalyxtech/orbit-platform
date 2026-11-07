import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext } from '@orbit/core';
import { billingEvents, billingPlans, companySubscriptions, type Tx } from '@orbit/db';
import { customPrice, getCustomPlan, type CustomCycle } from '../custom/plan';
import * as rz from './razorpay';
import { billingState } from './state';

// Checkout for a custom customer: the monthly or yearly price Super Admin agreed with them.
// Kept apart from the standard plans; the subscription is stored with plan "custom".

const RZ: Record<CustomCycle, { period: 'monthly' | 'yearly'; totalCount: number; label: string }> = {
  monthly: { period: 'monthly', totalCount: 120, label: 'Monthly' },
  yearly: { period: 'yearly', totalCount: 10, label: 'Yearly' },
};

async function razorpayCustomPlan(tx: Tx, companyId: string, cycle: CustomCycle, currency: 'INR' | 'USD', amount: number, label: string) {
  const key = `custom_${companyId}_${cycle}_${currency}`;
  const [row] = await tx.select().from(billingPlans).where(eq(billingPlans.key, key));
  if (row && row.amount === amount) return row.razorpayPlanId;
  const created = await rz.createPlan({ period: RZ[cycle].period, interval: 1, name: `Orbit ${label} (${RZ[cycle].label})`, amount, currency, description: 'Custom plan' });
  await tx.insert(billingPlans).values({ key, razorpayPlanId: created.id, amount }).onConflictDoUpdate({ target: billingPlans.key, set: { razorpayPlanId: created.id, amount } });
  return created.id;
}

const input = z.object({ cycle: z.enum(['monthly', 'yearly']) });

export async function startCustomCheckout(tx: Tx, ctx: ActionContext, raw: z.input<typeof input>) {
  if (ctx.role !== 'company_admin') throw new Error('Only the company admin can manage the subscription');
  const { cycle } = input.parse(raw);
  const plan = await getCustomPlan(tx, ctx.companyId);
  if (!plan?.enabled) throw new Error('Your company does not have a custom plan. Contact Orbit.');
  const price = customPrice(plan, cycle);
  if (!price) throw new Error(`Orbit has not set a ${cycle} price for your plan yet.`);
  const state = await billingState(tx, ctx);
  if (state.status === 'active' && !state.cancelAtPeriodEnd && state.plan === 'custom' && state.cycle === cycle) throw new Error('You are already on this plan.');
  if (plan.maxUsers && state.usage.users > plan.maxUsers) throw new Error(`Your plan includes ${plan.maxUsers} people and you have ${state.usage.users}. Contact Orbit.`);
  const amount = price * 100; // paise or cents
  const rzPlan = await razorpayCustomPlan(tx, ctx.companyId, cycle, state.currency, amount, plan.label);
  const startAt = state.status === 'trial' && state.trialDaysLeft > 0 ? Math.floor(new Date(state.trialEndsAt).getTime() / 1000) : undefined;
  const sub = await rz.createSubscription({
    planId: rzPlan,
    totalCount: RZ[cycle].totalCount,
    notes: { company_id: ctx.companyId, company: ctx.companyName, plan: 'custom', cycle, currency: state.currency },
    startAt,
  });
  await tx
    .insert(companySubscriptions)
    .values({ companyId: ctx.companyId, plan: 'custom', cycle, status: 'created', razorpaySubscriptionId: sub.id, trialEndsAt: new Date(state.trialEndsAt) })
    .onConflictDoUpdate({
      target: companySubscriptions.companyId,
      set: { plan: 'custom', cycle, status: 'created', razorpaySubscriptionId: sub.id, cancelAtPeriodEnd: false, updatedAt: new Date() },
    });
  await tx.insert(billingEvents).values({ companyId: ctx.companyId, type: 'checkout.started', razorpayId: sub.id, amount, data: { plan: 'custom', cycle, currency: state.currency } });
  return { subscriptionId: sub.id, keyId: await rz.publicKeyId(), planName: plan.label, amount: price, currency: state.currency, cycle: RZ[cycle].label, email: ctx.email, name: ctx.name };
}
