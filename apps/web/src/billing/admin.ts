import { and, desc, eq, gt, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { billingEvents, companies, companyBilling, companySubscriptions, type Tx } from '@orbit/db';
import { BILLING_LAUNCH, cycleOf, type Currency } from './plans';
import { customPrice, getCustomPlan, type CustomCycle } from '../custom/plan';
import { billingSettings, billingStateFor, missing } from './state';

// Super Admin side of billing: settings per company and the payments SteelConnect360 has received.
// Every function runs inside withTenant for one company (RLS), like the rest of Super Admin.

/** Events that mean a company has paid or confirmed a subscription. */
export const CONFIRMATIONS = ['checkout.completed', 'subscription.activated', 'subscription.charged'];

export const settingsInput = z.object({
  currency: z.enum(['INR', 'USD', 'GBP']),
  showPlans: z.boolean(),
  trialDays: z.coerce.number().int().min(0).max(3650),
});
export type SettingsInput = z.infer<typeof settingsInput>;

/** Currency, plans released or hidden, and trial length for one company. */
export async function saveBillingSettings(tx: Tx, companyId: string, raw: z.input<typeof settingsInput>) {
  const s = settingsInput.parse(raw);
  await tx
    .insert(companyBilling)
    .values({ companyId, currency: s.currency, showPlans: s.showPlans, trialDays: s.trialDays })
    .onConflictDoUpdate({ target: companyBilling.companyId, set: { currency: s.currency, showPlans: s.showPlans, trialDays: s.trialDays, updatedAt: new Date() } });
  return s;
}

const DAY = 864e5;

/**
 * Gives a company `days` of free use from now, or adds them to a free period that is still
 * running. The free period is stored as days from sign-up, so the new length is worked out
 * from the date it should end on. Returns that date.
 */
export async function extendFreePeriod(tx: Tx, companyId: string, days: number) {
  const add = z.number().int().min(1).max(365).parse(days);
  const state = await billingStateFor(tx, companyId);
  const settings = await billingSettings(tx, companyId);
  const [company] = await tx.select({ createdAt: companies.createdAt }).from(companies).where(eq(companies.id, companyId));
  if (!company) throw new Error('Company not found');
  const start = Math.max(company.createdAt.getTime(), new Date(BILLING_LAUNCH).getTime());
  const from = Math.max(Date.now(), new Date(state.trialEndsAt).getTime());
  const end = new Date(from + add * DAY);
  // Whole days from sign-up, rounded down so "+7 days" reads as 7 days left, not 8.
  const trialDays = Math.min(3650, Math.max(1, Math.floor((end.getTime() - start) / DAY)));
  await saveBillingSettings(tx, companyId, { ...settings, trialDays });
  // A checkout that was started keeps its own copy of the trial end: move that too.
  await tx.update(companySubscriptions).set({ trialEndsAt: end, updatedAt: new Date() }).where(and(eq(companySubscriptions.companyId, companyId), isNotNull(companySubscriptions.trialEndsAt)));
  return end;
}

/** Super Admin has looked at this company's payments: they stop showing as new. */
export async function markPaymentsSeen(tx: Tx, companyId: string) {
  await tx
    .insert(companyBilling)
    .values({ companyId, seenAt: new Date() })
    .onConflictDoUpdate({ target: companyBilling.companyId, set: { seenAt: new Date() } });
}

/** Confirmations newer than Super Admin's last look. 0 before migrations 0011/0012. */
export async function newConfirmations(tx: Tx, companyId: string) {
  try {
    return await tx.transaction(async (sp) => {
      const [b] = await sp.select({ seenAt: companyBilling.seenAt }).from(companyBilling).where(eq(companyBilling.companyId, companyId));
      const rows = await sp
        .select({ id: billingEvents.id })
        .from(billingEvents)
        .where(and(eq(billingEvents.companyId, companyId), inArray(billingEvents.type, CONFIRMATIONS), b?.seenAt ? gt(billingEvents.createdAt, b.seenAt) : undefined));
      return rows.length;
    });
  } catch (err) {
    if (missing(err)) return 0;
    throw err;
  }
}

/** One company's subscription as Super Admin sees it: settings, plan, price, payments. */
export async function companyBillingSummary(tx: Tx, companyId: string) {
  // One after another: savepoints on the same transaction must not interleave.
  const state = await billingStateFor(tx, companyId);
  const settings = await billingSettings(tx, companyId);
  const fresh = await newConfirmations(tx, companyId);
  let events: (typeof billingEvents.$inferSelect)[] = [];
  try {
    events = await tx.transaction((sp) => sp.select().from(billingEvents).where(eq(billingEvents.companyId, companyId)).orderBy(desc(billingEvents.createdAt)).limit(20));
  } catch (err) {
    if (!missing(err)) throw err;
  }
  const currency: Currency = settings.currency;
  const custom = state.plan === 'custom' ? await getCustomPlan(tx, companyId) : null;
  const price =
    state.price !== null
      ? state.price
      : custom && state.cycle
        ? customPrice(custom, state.cycle as CustomCycle)
        : null;
  const lastPayment = events.find((e) => CONFIRMATIONS.includes(e.type) && e.amount) ?? events.find((e) => CONFIRMATIONS.includes(e.type)) ?? null;
  return {
    state,
    settings,
    price,
    per: state.cycle ? (custom ? (state.cycle === 'yearly' ? 'year' : 'month') : cycleOf(state.cycle).per) : null,
    events,
    lastPayment,
    newCount: fresh,
  };
}
export type CompanyBillingSummary = Awaited<ReturnType<typeof companyBillingSummary>>;

/** Currency stored on an event (webhooks and checkout save it), else the company's currency. */
export const eventCurrency = (e: { data: unknown }, fallback: Currency): Currency => {
  const c = (e.data as { currency?: string } | null)?.currency?.toUpperCase();
  return c === 'USD' || c === 'GBP' || c === 'INR' ? c : fallback;
};
