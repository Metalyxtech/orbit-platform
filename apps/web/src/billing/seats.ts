import { and, eq } from 'drizzle-orm';
import { billingEvents, billingPlans, companySubscriptions, memberships, subscriptionSeats, type Tx } from '@orbit/db';
import { billableSeats, cycleOf, planOf, seatQuote, type Bundle, type Currency, type Cycle } from './plans';
import * as rz from './razorpay';

// Per-user plans: the subscription is billed for the people in the company.
//  - Someone added or removed: the new count is sent to Razorpay to apply from the next billing
//    date (nothing is charged or refunded mid-period), so a removal lowers the bill after the
//    period already paid for, and an addition raises it from the next bill.
//  - Razorpay cannot change UPI AutoPay or e-mandate subscriptions. Then the new count waits
//    (pending_seats) and the admin confirms it once on Plan and billing, which sets up the
//    subscription again for the new amount from the next billing date.
// Nothing here may stop a person being added or removed: every failure is recorded instead.

const PAID = ['active', 'authenticated'];
const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
const tableMissing = (err: unknown) => pgCode(err) === '42P01' || /relation "subscription_seats" does not exist/.test(String(err));

export interface Seats {
  /** People billed from the next charge (null: not on a per-user plan yet). */
  seats: number | null;
  /** A new count waiting for the admin to confirm (UPI AutoPay or e-mandate). */
  pendingSeats: number | null;
}

/** Seats stored for the company (null before migration 0032 or before the first per-user checkout). */
export async function readSeats(tx: Tx, companyId: string): Promise<Seats> {
  try {
    const [row] = await tx.transaction((sp) => sp.select().from(subscriptionSeats).where(eq(subscriptionSeats.companyId, companyId)));
    return { seats: row?.seats ?? null, pendingSeats: row?.pendingSeats ?? null };
  } catch (err) {
    if (tableMissing(err)) return { seats: null, pendingSeats: null };
    throw err;
  }
}

export async function writeSeats(tx: Tx, companyId: string, seats: number, pendingSeats: number | null) {
  await tx
    .insert(subscriptionSeats)
    .values({ companyId, seats, pendingSeats })
    .onConflictDoUpdate({ target: subscriptionSeats.companyId, set: { seats, pendingSeats, updatedAt: new Date() } });
}

/** Active people and how many of them are management (up to 2 of those are free). */
export async function headcount(tx: Tx, companyId: string) {
  const rows = await tx.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.companyId, companyId), eq(memberships.status, 'active')));
  const management = rows.filter((r) => r.role === 'management').length;
  return { active: rows.length, management, billable: billableSeats(rows.length, management) };
}

/** The Razorpay plan for a bundle at a number of people and cycle, created on first use. */
export async function seatPlanId(tx: Tx, bundle: Bundle, seats: number, cycle: Cycle, currency: Currency) {
  const q = seatQuote(bundle, seats, cycle, currency);
  const key = `${bundle}_users_${q.seats}_${cycle}_${currency}`;
  const amount = Math.round(q.total * 100); // paise, pence or cents
  const [row] = await tx.select().from(billingPlans).where(eq(billingPlans.key, key));
  if (row && row.amount === amount) return row.razorpayPlanId;
  const c = cycleOf(cycle);
  const name = planOf(`${bundle}_users`)?.name ?? bundle;
  const created = await rz.createPlan({ period: c.rz.period, interval: c.rz.interval, name: `SteelConnect360 ${name} (${c.label})`, amount, currency, description: `${q.seats} people` });
  await tx
    .insert(billingPlans)
    .values({ key, razorpayPlanId: created.id, amount })
    .onConflictDoUpdate({ target: billingPlans.key, set: { razorpayPlanId: created.id, amount } });
  return created.id;
}

export type SeatSync =
  | { result: 'not_per_user' }
  | { result: 'unchanged'; seats: number }
  | { result: 'scheduled'; from: number; to: number }
  | { result: 'needs_confirmation'; from: number; to: number };

/**
 * Brings the subscription in line with the people in the company. Call after anyone is added,
 * removed, blocked or approved. Never throws: a failure is recorded and left for the admin.
 */
export async function syncSeats(tx: Tx, companyId: string, currency: Currency): Promise<SeatSync> {
  try {
    return await tx.transaction((sp) => applySeats(sp, companyId, currency));
  } catch (err) {
    console.error(JSON.stringify({ seats: 'sync_failed', companyId, error: String(err).slice(0, 300) }));
    try {
      await tx.insert(billingEvents).values({ companyId, type: 'seats.sync_failed', data: { error: String(err).slice(0, 300) } });
    } catch {
      // Billing tables not there yet: nothing to record.
    }
    return { result: 'not_per_user' };
  }
}

async function applySeats(tx: Tx, companyId: string, currency: Currency): Promise<SeatSync> {
  const [sub] = await tx.select().from(companySubscriptions).where(eq(companySubscriptions.companyId, companyId));
  const plan = sub ? planOf(sub.plan) : undefined;
  if (!sub || !plan?.perUser || !sub.razorpaySubscriptionId || !PAID.includes(sub.status) || sub.cancelAtPeriodEnd) return { result: 'not_per_user' };
  const stored = await readSeats(tx, companyId);
  const { billable: to } = await headcount(tx, companyId);
  const from = stored.seats ?? to;
  if (to === from) {
    if (stored.pendingSeats !== null) await writeSeats(tx, companyId, from, null); // back to what is billed: nothing to confirm
    return { result: 'unchanged', seats: from };
  }
  const cycle = sub.cycle as Cycle;
  const rzPlan = await seatPlanId(tx, plan.bundle, to, cycle, currency);
  try {
    await schedule(sub.razorpaySubscriptionId, rzPlan);
  } catch (err) {
    if (!rz.cannotUpdate(err) && !(err instanceof rz.RazorpayError)) throw err;
    await writeSeats(tx, companyId, from, to);
    await tx.insert(billingEvents).values({ companyId, type: 'seats.needs_confirmation', razorpayId: sub.razorpaySubscriptionId, data: { from, to, reason: (err as rz.RazorpayError).description || String(err).slice(0, 200) } });
    return { result: 'needs_confirmation', from, to };
  }
  const q = seatQuote(plan.bundle, to, cycle, currency);
  await writeSeats(tx, companyId, to, null);
  await tx.insert(billingEvents).values({ companyId, type: 'seats.changed', razorpayId: sub.razorpaySubscriptionId, amount: Math.round(q.total * 100), data: { from, to, currency } });
  return { result: 'scheduled', from, to };
}

/** One sentence for the person who made the change (empty when billing is not affected). */
export function seatMessage(r: SeatSync) {
  if (r.result === 'scheduled') return `The subscription now bills ${r.to} people instead of ${r.from}, from the next billing date.`;
  if (r.result === 'needs_confirmation') return `The new number of people (${r.to}) needs the company admin to confirm it once in Plan and billing.`;
  return '';
}

/** Schedules the plan change for the next billing date, replacing a change already waiting. */
async function schedule(subscriptionId: string, planId: string) {
  try {
    await rz.updateSubscriptionPlan(subscriptionId, planId, 'cycle_end');
  } catch (err) {
    if (!rz.changeAlreadyScheduled(err)) throw err;
    await rz.cancelScheduledChange(subscriptionId);
    await rz.updateSubscriptionPlan(subscriptionId, planId, 'cycle_end');
  }
}
