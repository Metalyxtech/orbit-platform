import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { billingEvents, companyBilling, type Tx } from '@orbit/db';
import { cycleOf, priceFor, type Currency, type Cycle } from './plans';
import { customPrice, getCustomPlan } from '../custom/plan';
import { billingSettings, billingStateFor, missing } from './state';

// Super Admin side of billing: settings per company and the payments Orbit has received.
// Every function runs inside withTenant for one company (RLS), like the rest of Super Admin.

/** Events that mean a company has paid or confirmed a subscription. */
export const CONFIRMATIONS = ['checkout.completed', 'subscription.activated', 'subscription.charged'];

export const settingsInput = z.object({
  currency: z.enum(['INR', 'USD']),
  showPlans: z.boolean(),
  trialDays: z.coerce.number().int().min(0).max(90),
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
    state.bundle && state.tier && state.cycle
      ? priceFor(state.bundle, state.tier, state.cycle as Cycle, currency)
      : custom && (state.cycle === 'monthly' || state.cycle === 'yearly')
        ? customPrice(custom, state.cycle)
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
  return c === 'USD' ? 'USD' : c === 'INR' ? 'INR' : fallback;
};
