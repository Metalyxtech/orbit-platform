import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { billingEvents, seatAddons, type Tx } from '@orbit/db';
import { cycleOf, extraSeatsQuote, type Bundle, type Cycle } from './plans';
import * as rz from './razorpay';
import { extraSeatPlanId } from './seats';
import { billingState } from './state';

// More seats on a per-user plan: a separate Razorpay subscription for the extra seats. Its first
// payment covers the rest of the period already paid for (an upfront amount), and from the main
// plan's next billing date it renews with it, so both always fall due on the same day.

const requireAdmin = (ctx: SessionContext) => {
  if (ctx.role !== 'company_admin') throw new Error('Only the company admin can buy seats');
};

/** What the company has, and the price of `add` more seats (shown before paying). */
export async function seatOffer(tx: Tx, ctx: SessionContext, add: number) {
  const s = await billingState(tx, ctx);
  const end = s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null;
  const ok = s.perUser && s.seats !== null && s.bundle && s.cycle && (s.status === 'active' || s.status === 'past_due') && !s.cancelAtPeriodEnd && !!end && end.getTime() > Date.now() + 3_600_000;
  if (!ok) throw new Error('Extra seats can be bought while a per-user plan is active. Choose a plan in Plan and billing first.');
  const n = z.number().int().min(1).max(1000).parse(add);
  return { state: s, add: n, end: end!, quote: extraSeatsQuote(s.bundle as Bundle, s.seats!, n, s.cycle as Cycle, s.currency, end) };
}

/** Creates the extra-seat subscription; the browser then opens Razorpay Checkout with its id. */
export async function startSeatsCheckout(tx: Tx, ctx: ActionContext, raw: { add: number }) {
  requireAdmin(ctx);
  const { state: s, add, end, quote } = await seatOffer(tx, ctx, raw.add);
  const bundle = s.bundle as Bundle;
  const cycle = s.cycle as Cycle;
  const planId = await extraSeatPlanId(tx, bundle, s.seats!, add, cycle, s.currency);
  const sub = await rz.createSubscription({
    planId,
    totalCount: cycleOf(cycle).rz.totalCount,
    notes: { company_id: ctx.companyId, company: ctx.companyName, kind: 'seats', seats: String(add), currency: s.currency },
    // Renews with the main plan; the rest of this period is paid now as an upfront amount.
    startAt: Math.floor(end.getTime() / 1000),
    addons: quote.dueNow > 0 ? [{ name: `${add} more ${add === 1 ? 'seat' : 'seats'} until ${end.toISOString().slice(0, 10)}`, amount: Math.round(quote.dueNow * 100), currency: s.currency }] : undefined,
  });
  await tx.insert(seatAddons).values({ companyId: ctx.companyId, razorpaySubscriptionId: sub.id, seats: add, status: 'started' });
  await tx.insert(billingEvents).values({ companyId: ctx.companyId, type: 'seats.checkout_started', razorpayId: sub.id, amount: Math.round(quote.dueNow * 100), data: { seats: add, perCycle: quote.perCycle, currency: s.currency } });
  return {
    subscriptionId: sub.id,
    keyId: await rz.publicKeyId(),
    planName: `${add} more ${add === 1 ? 'seat' : 'seats'}`,
    amount: quote.dueNow,
    currency: s.currency,
    cycle: cycleOf(cycle).label,
    email: ctx.email,
    name: ctx.name,
    paidUntil: null as string | null,
  };
}

const confirmInput = z.object({ paymentId: z.string().min(5).max(80), subscriptionId: z.string().min(5).max(80), signature: z.string().min(10).max(200) });

/** Checkout for extra seats returned: verify the signature, then the seats can be used. */
export async function confirmSeatsCheckout(tx: Tx, ctx: ActionContext, raw: z.input<typeof confirmInput>) {
  requireAdmin(ctx);
  const input = confirmInput.parse(raw);
  const [addon] = await tx
    .select()
    .from(seatAddons)
    .where(and(eq(seatAddons.companyId, ctx.companyId), eq(seatAddons.razorpaySubscriptionId, input.subscriptionId)));
  if (!addon) throw new Error('This payment is not for your company');
  if (!(await rz.verifyCheckoutSignature(input.paymentId, input.subscriptionId, input.signature))) {
    throw new Error('The payment could not be verified. Nothing was charged twice; contact SteelConnect360 if money left your account.');
  }
  await tx.update(seatAddons).set({ status: 'active', updatedAt: new Date() }).where(eq(seatAddons.id, addon.id));
  await tx.insert(billingEvents).values({ companyId: ctx.companyId, type: 'seats.added', razorpayId: input.paymentId, data: { seats: addon.seats, subscription: input.subscriptionId } });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'billing.seats_added', entity: 'seat_addons', entityId: addon.id, data: { summary: [`${addon.seats} more seats bought`] }, requestId: ctx.requestId });
  return { seats: addon.seats };
}

const ENDED = ['halted', 'cancelled', 'completed', 'expired'];
const PAID = ['authenticated', 'active'];

/** Webhook for an extra-seat subscription: its seats count while Razorpay keeps it paid. */
export async function applySeatAddonEvent(tx: Tx, companyId: string, live: rz.RzSubscription) {
  const status = ENDED.includes(live.status) ? 'ended' : PAID.includes(live.status) ? 'active' : null;
  if (!status) return;
  // Ended stays ended (for example replaced by a new plan that already pays for these seats).
  await tx
    .update(seatAddons)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(seatAddons.companyId, companyId), eq(seatAddons.razorpaySubscriptionId, live.id), ne(seatAddons.status, 'ended')));
}
