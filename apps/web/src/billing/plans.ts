// Orbit subscription plans: which portals (bundle) x team size (tier) x how often to pay (cycle).
// Prices in rupees (India, GST extra) or US dollars at USD_RATE (foreign clients). Change prices here only.
// Safe to import from client components.

/** Stored in plan ids (e.g. "both_growth"), so existing ids never change: 'both' is Timesheet + Purchase. */
export type Bundle = 'timesheet' | 'purchase' | 'sales' | 'both' | 'timesheet_sales' | 'purchase_sales' | 'all';
export type TierId = 'starter' | 'growth' | 'business';
export type Cycle = 'monthly' | 'quarterly' | 'halfyearly' | 'yearly';
export type PlanId = `${Bundle}_${TierId}`;

export const TRIAL_DAYS = 7;
/** Companies that signed up before billing launched get their trial counted from this date. */
export const BILLING_LAUNCH = '2026-11-06T00:00:00Z';

export type Currency = 'INR' | 'USD';
/** Foreign clients pay in US dollars at this rate (rounded up to whole dollars). */
export const USD_RATE = 90;

export const BUNDLES: { id: Bundle; name: string; portals: string[]; desc: string; best?: boolean }[] = [
  { id: 'timesheet', name: 'Timesheet', portals: ['timesheet'], desc: 'Weekly timesheets, approvals, overtime and project hours' },
  { id: 'purchase', name: 'Purchase', portals: ['procurement'], desc: 'Requisitions, quotes, POs, stock, receipts and invoices' },
  { id: 'sales', name: 'Sales', portals: ['sales'], desc: 'Enquiries, project documents, costing, quotations, orders and collections' },
  { id: 'both', name: 'Timesheet + Purchase', portals: ['timesheet', 'procurement'], desc: 'Site hours and buying in one login' },
  { id: 'timesheet_sales', name: 'Timesheet + Sales', portals: ['timesheet', 'sales'], desc: 'Win the work and track the hours on it' },
  { id: 'purchase_sales', name: 'Purchase + Sales', portals: ['procurement', 'sales'], desc: 'Quote, win, then buy for the job' },
  { id: 'all', name: 'All three portals', portals: ['timesheet', 'procurement', 'sales'], desc: 'Timesheet, Purchase and Sales, one login, one GM dashboard', best: true },
];
/** Combined bundles: each portal's own bundle, for "you save" against buying them separately. */
const SINGLE: Record<string, Bundle> = { timesheet: 'timesheet', procurement: 'purchase', sales: 'sales' };
export const isCombo = (b: Bundle) => (bundleOf(b)?.portals.length ?? 0) > 1;

export const TIERS: { id: TierId; name: string; tagline: string; users: number; popular?: boolean; features: string[] }[] = [
  { id: 'starter', name: 'Starter', tagline: 'For small teams getting started', users: 10, features: ['Up to 10 people', 'Approval workflows', 'Dashboards and reports', 'Email support'] },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'For growing companies with several teams',
    users: 40,
    popular: true,
    features: ['Up to 40 people', 'Approval matrix and industry forms', 'GM dashboards with charts', 'Change history and notifications', 'Priority email support'],
  },
  { id: 'business', name: 'Business', tagline: 'For larger companies and multiple sites', users: 150, features: ['Up to 150 people', 'Everything in Growth', 'Dedicated onboarding session', 'Phone and WhatsApp support'] },
];

/** Price per month in rupees when paid monthly (covers hosting and payment costs). */
// Two portals together cost about 20% less than separately; all three about 30% less.
const MONTHLY_INR: Record<Bundle, Record<TierId, number>> = {
  timesheet: { starter: 1199, growth: 2999, business: 6999 },
  purchase: { starter: 1799, growth: 4199, business: 9599 },
  sales: { starter: 1799, growth: 4199, business: 9599 },
  both: { starter: 2399, growth: 5999, business: 13999 },
  timesheet_sales: { starter: 2399, growth: 5999, business: 13999 },
  purchase_sales: { starter: 2899, growth: 6799, business: 15499 },
  all: { starter: 3399, growth: 7999, business: 18499 },
};

/** Monthly price in the client's currency: rupees, or dollars at USD_RATE rounded up. */
export function monthly(b: Bundle, t: TierId, cur: Currency = 'INR') {
  const v = MONTHLY_INR[b][t];
  return cur === 'USD' ? Math.ceil(v / USD_RATE) : v;
}

/** Payment options. Longer terms cost less. `rz` is how Razorpay bills the cycle. */
export const CYCLES: { id: Cycle; label: string; months: number; discount: number; badge?: string; per: string; rz: { period: 'monthly' | 'yearly'; interval: number; totalCount: number } }[] = [
  { id: 'monthly', label: 'Monthly', months: 1, discount: 0, per: 'month', rz: { period: 'monthly', interval: 1, totalCount: 120 } },
  { id: 'quarterly', label: 'Quarterly', months: 3, discount: 0.05, badge: 'Save 5%', per: 'quarter', rz: { period: 'monthly', interval: 3, totalCount: 40 } },
  { id: 'halfyearly', label: 'Half-yearly', months: 6, discount: 0.1, badge: 'Save 10%', per: '6 months', rz: { period: 'monthly', interval: 6, totalCount: 20 } },
  { id: 'yearly', label: 'Yearly', months: 12, discount: 1 / 6, badge: '2 months free', per: 'year', rz: { period: 'yearly', interval: 1, totalCount: 10 } },
];

/**
 * Portals not priced in any plan yet: included with every plan and the trial, never paused by a
 * plan change. A new portal goes here until it gets bundles and prices above.
 */
export const UNPRICED_PORTALS: string[] = ['production'];

/** Limits while on the free trial: every portal, Growth team size. */
export const TRIAL_LIMITS = { users: 40, portals: ['timesheet', 'procurement', 'sales', ...UNPRICED_PORTALS] };

export const cycleOf = (c: string) => CYCLES.find((x) => x.id === c) ?? CYCLES[0];
export const bundleOf = (b: string) => BUNDLES.find((x) => x.id === b);
export const tierOf = (t: string) => TIERS.find((x) => x.id === t);
export const planId = (b: Bundle, t: TierId): PlanId => `${b}_${t}`;

/** Name, users and portals for a stored plan id like "both_growth". */
export function planOf(id: string) {
  const cut = id.lastIndexOf('_'); // bundle ids can contain "_" (purchase_sales_growth)
  const [b, t] = [id.slice(0, cut), id.slice(cut + 1)];
  const bundle = bundleOf(b);
  const tier = tierOf(t);
  if (!bundle || !tier) return undefined;
  return { id: id as PlanId, bundle: bundle.id, tier: tier.id, name: `${bundle.name} ${tier.name}`, users: tier.users, portals: [...bundle.portals, ...UNPRICED_PORTALS] };
}

/** Display name of a portal id. */
export const portalName = (p: string) => (({ procurement: 'Purchase', timesheet: 'Timesheet', sales: 'Sales', production: 'Production' }) as Record<string, string>)[p] ?? p;

/** Portals in use that a plan does not include: they are paused when the company moves to it. */
export function portalsOutside(id: string, inUse: string[]) {
  const plan = planOf(id);
  return plan ? inUse.filter((p) => !plan.portals.includes(p)) : [];
}

/** Amount charged each cycle, in the client's currency. */
export function priceFor(b: Bundle, t: TierId, cycle: Cycle, cur: Currency = 'INR') {
  const c = cycleOf(cycle);
  return Math.round(monthly(b, t, cur) * c.months * (1 - c.discount));
}
export const perMonthFor = (b: Bundle, t: TierId, cycle: Cycle, cur: Currency = 'INR') => Math.round(priceFor(b, t, cycle, cur) / cycleOf(cycle).months);
export const savingFor = (b: Bundle, t: TierId, cycle: Cycle, cur: Currency = 'INR') =>
  monthly(b, t, cur) * cycleOf(cycle).months - priceFor(b, t, cycle, cur);
/** What the bundle's portals cost per month when bought one by one. */
export const separatelyFor = (b: Bundle, t: TierId, cur: Currency = 'INR') => (bundleOf(b)?.portals ?? []).reduce((n, p) => n + monthly(SINGLE[p], t, cur), 0);
/** How much a combined bundle saves against buying its portals separately, per month (0 for one portal). */
export const bundleSaving = (t: TierId, cur: Currency = 'INR', b: Bundle = 'both') => (isCombo(b) ? separatelyFor(b, t, cur) - monthly(b, t, cur) : 0);
/** The saving as a whole percentage, for "save 30%" badges. */
export const bundleSavingPct = (b: Bundle, t: TierId = 'growth') => (isCombo(b) ? Math.round((bundleSaving(t, 'INR', b) / separatelyFor(b, t)) * 100) : 0);

/** The smallest bundle that covers every portal in use (the default choice on the billing page). */
export function bundleFor(used: string[]): Bundle {
  const fits = BUNDLES.filter((b) => used.every((p) => b.portals.includes(p) || !SINGLE[p]));
  return fits.sort((a, b) => a.portals.length - b.portals.length)[0]?.id ?? 'all';
}

/** Money in the client's currency, e.g. ₹5,999 or $67. */
export function money(v: number, cur: Currency = 'INR') {
  const opts = { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 };
  return cur === 'USD' ? `$${v.toLocaleString('en-US', opts)}` : `₹${v.toLocaleString('en-IN', opts)}`;
}
/** Rupees (older callers). */
export const inr = (v: number) => money(v, 'INR');
export const taxNote = (cur: Currency) => (cur === 'USD' ? 'Prices in US dollars' : 'GST extra');

/** A yearly price paid monthly: 12 equal payments (rounded up to the whole rupee or dollar). */
export const installmentOf = (yearly: number) => Math.ceil(yearly / 12);
