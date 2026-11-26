import { and, eq } from 'drizzle-orm';
import { billingPlans, memberships, seatAddons, subscriptionSeats, type Tx } from '@orbit/db';
import { FREE_VIEWERS, MIN_SEATS, cycleOf, extraSeatsQuote, planOf, seatQuote, type Bundle, type Currency, type Cycle } from './plans';
import * as rz from './razorpay';

// Per-user plans are bought as seats.
//  - The main subscription pays for a number of seats for the whole period (already charged for a
//    quarter or a year), so removing someone never changes the bill: their seat is free to fill.
//  - Adding someone when every seat is taken needs more seats: a separate subscription for the extra
//    seats, charged now for the rest of the current period and then renewing with the main plan.
//  - Up to FREE_VIEWERS management people (GM, directors) do not take a seat.

const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
const tableMissing = (err: unknown) => pgCode(err) === '42P01' || /relation "(subscription_seats|seat_addons)" does not exist/.test(String(err));

export interface Seats {
  /** Seats paid by the main subscription (null: not on a per-user plan yet). */
  main: number | null;
  /** Seats bought later, still paid for. */
  extra: number;
  /** Extra-seat subscriptions still paid for. */
  addons: { id: string; subscriptionId: string; seats: number }[];
}

/** Seats the company has paid for (empty before migration 0032 or the first per-user checkout). */
export async function readSeats(tx: Tx, companyId: string): Promise<Seats> {
  try {
    return await tx.transaction(async (sp) => {
      const [row] = await sp.select().from(subscriptionSeats).where(eq(subscriptionSeats.companyId, companyId));
      const addons = await sp
        .select({ id: seatAddons.id, subscriptionId: seatAddons.razorpaySubscriptionId, seats: seatAddons.seats })
        .from(seatAddons)
        .where(and(eq(seatAddons.companyId, companyId), eq(seatAddons.status, 'active')));
      return { main: row?.seats ?? null, extra: addons.reduce((n, a) => n + a.seats, 0), addons };
    });
  } catch (err) {
    if (tableMissing(err)) return { main: null, extra: 0, addons: [] };
    throw err;
  }
}

export async function writeMainSeats(tx: Tx, companyId: string, seats: number) {
  await tx
    .insert(subscriptionSeats)
    .values({ companyId, seats })
    .onConflictDoUpdate({ target: subscriptionSeats.companyId, set: { seats, updatedAt: new Date() } });
}

/** Seats a set of people takes: everyone active except up to FREE_VIEWERS management people. */
export const seatsTaken = (active: number, management: number) => Math.max(0, active - Math.min(FREE_VIEWERS, management));

/** Active people, how many are management, the seats they take, and the smallest plan that fits them. */
export async function headcount(tx: Tx, companyId: string) {
  const rows = await tx.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.companyId, companyId), eq(memberships.status, 'active')));
  const management = rows.filter((r) => r.role === 'management').length;
  const used = seatsTaken(rows.length, management);
  return { active: rows.length, management, used, billable: Math.max(MIN_SEATS, used) };
}

/** A Razorpay plan for an amount per cycle, created once and reused by its key. */
async function planFor(tx: Tx, key: string, input: { name: string; description: string; amount: number; cycle: Cycle; currency: Currency }) {
  const amount = Math.round(input.amount * 100); // paise, pence or cents
  const [row] = await tx.select().from(billingPlans).where(eq(billingPlans.key, key));
  if (row && row.amount === amount) return row.razorpayPlanId;
  const c = cycleOf(input.cycle);
  const created = await rz.createPlan({ period: c.rz.period, interval: c.rz.interval, name: input.name, amount, currency: input.currency, description: input.description });
  await tx
    .insert(billingPlans)
    .values({ key, razorpayPlanId: created.id, amount })
    .onConflictDoUpdate({ target: billingPlans.key, set: { razorpayPlanId: created.id, amount } });
  return created.id;
}

const bundleName = (b: Bundle) => planOf(`${b}_users`)?.name ?? b;

/** The main subscription's plan: a bundle for a number of seats. */
export function seatPlanId(tx: Tx, bundle: Bundle, seats: number, cycle: Cycle, currency: Currency) {
  const q = seatQuote(bundle, seats, cycle, currency);
  return planFor(tx, `${bundle}_users_${q.seats}_${cycle}_${currency}`, {
    name: `SteelConnect360 ${bundleName(bundle)} (${cycleOf(cycle).label})`,
    description: `${q.seats} seats`,
    amount: q.total,
    cycle,
    currency,
  });
}

/**
 * Stops the company's extra-seat subscriptions at the end of their paid period. `endNow` also stops
 * counting their seats today (a new main subscription already pays for them); otherwise they count
 * until Razorpay reports them cancelled.
 */
export async function endSeatAddons(tx: Tx, companyId: string, endNow = true) {
  const { addons } = await readSeats(tx, companyId);
  for (const a of addons) {
    try {
      await rz.cancelSubscription(a.subscriptionId, true);
    } catch (err) {
      // Already cancelled or finished at Razorpay: nothing left to stop.
      console.error(JSON.stringify({ seats: 'addon_cancel_failed', companyId, subscription: a.subscriptionId, error: String(err).slice(0, 200) }));
    }
    if (endNow) await tx.update(seatAddons).set({ status: 'ended', updatedAt: new Date() }).where(eq(seatAddons.id, a.id));
  }
}

/** The extra-seat subscription's plan: `add` seats on top of `have`, for each renewal. */
export function extraSeatPlanId(tx: Tx, bundle: Bundle, have: number, add: number, cycle: Cycle, currency: Currency) {
  const { perCycle } = extraSeatsQuote(bundle, have, add, cycle, currency, null);
  return planFor(tx, `${bundle}_extra_${have}_${add}_${cycle}_${currency}`, {
    name: `SteelConnect360 ${bundleName(bundle)}: ${add} more ${add === 1 ? 'seat' : 'seats'} (${cycleOf(cycle).label})`,
    description: `${add} extra seats on top of ${have}`,
    amount: perCycle,
    cycle,
    currency,
  });
}
