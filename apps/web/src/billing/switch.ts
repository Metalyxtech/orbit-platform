import { and, desc, eq } from 'drizzle-orm';
import type { ActionContext } from '@orbit/core';
import { billingEvents, companySubscriptions, type Tx } from '@orbit/db';
import * as rz from './razorpay';

// Changing plan safely (standard and custom checkout share this):
//  - Starting a checkout does not touch the company's current subscription; it is only noted.
//    An abandoned checkout therefore never makes a paying company look unpaid.
//  - When the new subscription is confirmed it becomes the company's subscription, and the old
//    Razorpay subscription is cancelled so it can never charge again:
//      normal switch: the old one runs to the end of its paid period and the new one's first
//                     charge is that day (no double payment, no lost paid time);
//      with credit:   the unused value was taken off the first payment, so the old one stops now.

const PAID = ['active', 'authenticated'];
type State = { status: string; trialEndsAt: string; trialDaysLeft: number; currentPeriodEnd: string | null };

/** When the new subscription's first charge should be, and which subscription it replaces. */
export async function switchTiming(tx: Tx, companyId: string, state: State) {
  const [cur] = await tx.select().from(companySubscriptions).where(eq(companySubscriptions.companyId, companyId));
  const now = Date.now();
  const periodEnd = state.currentPeriodEnd ? new Date(state.currentPeriodEnd).getTime() : 0;
  const paidUntil = cur && PAID.includes(cur.status) && periodEnd > now + 60_000 ? periodEnd : 0;
  const trialUntil = state.status === 'trial' && state.trialDaysLeft > 0 ? new Date(state.trialEndsAt).getTime() : 0;
  const first = Math.max(paidUntil, trialUntil);
  return {
    /** Unix seconds of the first charge, or undefined to charge now. */
    startAt: first ? Math.floor(first / 1000) : undefined,
    /** The current paid period runs until this date (shown to the admin). */
    paidUntil: paidUntil ? new Date(paidUntil).toISOString() : null,
    replaces: cur?.razorpaySubscriptionId ?? null,
  };
}

export interface PendingCheckout {
  plan: string;
  cycle: string;
  currency: string;
  /** Razorpay subscription this one replaces once confirmed. */
  replaces: string | null;
  /** True when the old subscription must stop now (its unused value was credited). */
  cancelNow?: boolean;
  /** Credit taken off the first payment (custom plans). */
  credit?: number;
}

/** Notes a started checkout; nothing about the current subscription changes yet. */
export async function recordCheckout(tx: Tx, companyId: string, subId: string, amountMinor: number, p: PendingCheckout) {
  await tx.insert(billingEvents).values({ companyId, type: 'checkout.started', razorpayId: subId, amount: amountMinor, data: { ...p } });
}

/** The checkout this subscription id belongs to (null: not this company's). */
export async function pendingCheckout(tx: Tx, companyId: string, subId: string): Promise<PendingCheckout | null> {
  const [e] = await tx
    .select({ data: billingEvents.data })
    .from(billingEvents)
    .where(and(eq(billingEvents.companyId, companyId), eq(billingEvents.type, 'checkout.started'), eq(billingEvents.razorpayId, subId)))
    .orderBy(desc(billingEvents.createdAt))
    .limit(1);
  return (e?.data as PendingCheckout | undefined) ?? null;
}

/** Payment confirmed: the new subscription becomes the company's, and the old one is cancelled. */
export async function completeSwitch(tx: Tx, ctx: ActionContext, subId: string, p: PendingCheckout, trialEndsAt: Date) {
  await tx
    .insert(companySubscriptions)
    .values({ companyId: ctx.companyId, plan: p.plan, cycle: p.cycle, status: 'created', razorpaySubscriptionId: subId, trialEndsAt })
    .onConflictDoUpdate({
      target: companySubscriptions.companyId,
      set: { plan: p.plan, cycle: p.cycle, status: 'created', razorpaySubscriptionId: subId, cancelAtPeriodEnd: false, updatedAt: new Date() },
    });
  if (p.replaces && p.replaces !== subId) {
    try {
      await rz.cancelSubscription(p.replaces, !p.cancelNow);
      await tx.insert(billingEvents).values({ companyId: ctx.companyId, type: 'subscription.replaced', razorpayId: p.replaces, data: { by: subId, immediately: !!p.cancelNow } });
    } catch (err) {
      // Already cancelled or finished at Razorpay: nothing left to stop. Anything else is kept for Orbit to check.
      await tx.insert(billingEvents).values({ companyId: ctx.companyId, type: 'subscription.replace_failed', razorpayId: p.replaces, data: { by: subId, error: String(err).slice(0, 300) } });
    }
  }
}
