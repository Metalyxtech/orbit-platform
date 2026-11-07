import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext } from '@orbit/core';
import { billingPlans, type Tx } from '@orbit/db';
import { customCredit, customPrice, getCustomPlan, type CustomCycle } from '../custom/plan';
import * as rz from './razorpay';
import { billingState } from './state';
import { recordCheckout, switchTiming } from './switch';

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
  const timing = await switchTiming(tx, ctx.companyId, state);
  // Yearly with a credit for the unused part of the old plan: pay (yearly - credit) now as an
  // upfront amount, full yearly price from next year; the old plan stops now (it was credited).
  const credit = customCredit(plan, cycle);
  const firstPayment = credit ? Math.max(0, price - credit) : price;
  const startAt = credit ? Math.floor(Date.now() / 1000) + 365 * 86_400 : timing.startAt;
  const sub = await rz.createSubscription({
    planId: rzPlan,
    totalCount: RZ[cycle].totalCount,
    notes: { company_id: ctx.companyId, company: ctx.companyName, plan: 'custom', cycle, currency: state.currency },
    startAt,
    addons: credit && firstPayment > 0 ? [{ name: `${plan.label}: first year after credit`, amount: firstPayment * 100, currency: state.currency }] : undefined,
  });
  await recordCheckout(tx, ctx.companyId, sub.id, firstPayment * 100, { plan: 'custom', cycle, currency: state.currency, replaces: timing.replaces, cancelNow: !!credit, credit });
  return {
    subscriptionId: sub.id,
    keyId: await rz.publicKeyId(),
    planName: plan.label,
    amount: firstPayment,
    currency: state.currency,
    cycle: RZ[cycle].label,
    email: ctx.email,
    name: ctx.name,
    paidUntil: credit ? null : timing.paidUntil,
  };
}
