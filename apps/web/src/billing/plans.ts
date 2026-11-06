// Orbit subscription plans: which portals (bundle) x team size (tier) x how often to pay (cycle).
// Prices in rupees per month, GST extra. Change prices, limits, discounts and features here only.
// Safe to import from client components.

export type Bundle = 'timesheet' | 'purchase' | 'both';
export type TierId = 'starter' | 'growth' | 'business';
export type Cycle = 'monthly' | 'quarterly' | 'halfyearly' | 'yearly';
export type PlanId = `${Bundle}_${TierId}`;

export const TRIAL_DAYS = 7;
/** Companies that signed up before billing launched get their trial counted from this date. */
export const BILLING_LAUNCH = '2026-11-06T00:00:00Z';
export const CURRENCY = '₹';

export const BUNDLES: { id: Bundle; name: string; portals: string[]; desc: string }[] = [
  { id: 'timesheet', name: 'Timesheet', portals: ['timesheet'], desc: 'Weekly timesheets, approvals, overtime and project hours' },
  { id: 'purchase', name: 'Purchase', portals: ['procurement'], desc: 'Requisitions, quotes, POs, stock, receipts and invoices' },
  { id: 'both', name: 'Timesheet + Purchase', portals: ['timesheet', 'procurement'], desc: 'Both portals, one login, one GM dashboard' },
];

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

/** Price per month when paid monthly (₹). */
export const MONTHLY: Record<Bundle, Record<TierId, number>> = {
  timesheet: { starter: 999, growth: 2499, business: 5999 },
  purchase: { starter: 1499, growth: 3499, business: 7999 },
  both: { starter: 1999, growth: 4999, business: 11999 },
};

/** Payment options. Longer terms cost less. `rz` is how Razorpay bills the cycle. */
export const CYCLES: { id: Cycle; label: string; months: number; discount: number; badge?: string; per: string; rz: { period: 'monthly' | 'yearly'; interval: number; totalCount: number } }[] = [
  { id: 'monthly', label: 'Monthly', months: 1, discount: 0, per: 'month', rz: { period: 'monthly', interval: 1, totalCount: 120 } },
  { id: 'quarterly', label: 'Quarterly', months: 3, discount: 0.05, badge: 'Save 5%', per: 'quarter', rz: { period: 'monthly', interval: 3, totalCount: 40 } },
  { id: 'halfyearly', label: 'Half-yearly', months: 6, discount: 0.1, badge: 'Save 10%', per: '6 months', rz: { period: 'monthly', interval: 6, totalCount: 20 } },
  { id: 'yearly', label: 'Yearly', months: 12, discount: 1 / 6, badge: '2 months free', per: 'year', rz: { period: 'yearly', interval: 1, totalCount: 10 } },
];

/** Limits while on the free trial: every portal, Growth team size. */
export const TRIAL_LIMITS = { users: 40, portals: ['timesheet', 'procurement'] };

export const cycleOf = (c: string) => CYCLES.find((x) => x.id === c) ?? CYCLES[0];
export const bundleOf = (b: string) => BUNDLES.find((x) => x.id === b);
export const tierOf = (t: string) => TIERS.find((x) => x.id === t);
export const planId = (b: Bundle, t: TierId): PlanId => `${b}_${t}`;

/** Name, users and portals for a stored plan id like "both_growth". */
export function planOf(id: string) {
  const [b, t] = id.split('_');
  const bundle = bundleOf(b);
  const tier = tierOf(t);
  if (!bundle || !tier) return undefined;
  return { id: id as PlanId, bundle: bundle.id, tier: tier.id, name: `${bundle.name} ${tier.name}`, users: tier.users, portals: bundle.portals };
}

/** Amount charged each cycle (₹). */
export function priceFor(b: Bundle, t: TierId, cycle: Cycle) {
  const c = cycleOf(cycle);
  return Math.round(MONTHLY[b][t] * c.months * (1 - c.discount));
}
export const perMonthFor = (b: Bundle, t: TierId, cycle: Cycle) => Math.round(priceFor(b, t, cycle) / cycleOf(cycle).months);
export const savingFor = (b: Bundle, t: TierId, cycle: Cycle) => MONTHLY[b][t] * cycleOf(cycle).months - priceFor(b, t, cycle);
/** How much the bundle saves against buying both portals separately, per month. */
export const bundleSaving = (t: TierId) => MONTHLY.timesheet[t] + MONTHLY.purchase[t] - MONTHLY.both[t];

export const inr = (v: number) => `${CURRENCY}${v.toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
