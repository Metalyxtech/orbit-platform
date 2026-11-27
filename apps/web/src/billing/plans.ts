// SteelConnect360 subscription plans: which portals (bundle) x number of people x how often to pay (cycle).
// Current plans are priced per person (SEAT_PRICE) in rupees (India), pounds (UK) or US dollars (everyone
// else). The older fixed team sizes (TIERS) stay readable for companies already on them.
// Change prices here only.
// Safe to import from client components.

/** Stored in plan ids (e.g. "both_growth"), so existing ids never change: 'both' is Timesheet + Purchase. */
export type Bundle =
  | 'timesheet'
  | 'purchase'
  | 'sales'
  | 'production'
  | 'quality'
  | 'both'
  | 'timesheet_sales'
  | 'purchase_sales'
  | 'all'
  | 'production_quality'
  | 'factory'
  | 'complete'
  | 'hr'
  | 'hr_timesheet'
  | 'timesheet_production'
  | 'timesheet_quality'
  | 'purchase_production'
  | 'purchase_quality'
  | 'sales_production'
  | 'sales_quality';
/** Fixed team sizes (older plans, kept for companies already on them). */
export type TierId = 'starter' | 'growth' | 'business';
/** 'users': priced per person (the current plans); the others are the older fixed team sizes. */
export type PlanTier = TierId | 'users';
export type Cycle = 'monthly' | 'quarterly' | 'halfyearly' | 'yearly';
export type PlanId = `${Bundle}_${PlanTier}`;

export const TRIAL_DAYS = 7;
/** Companies that signed up before billing launched get their trial counted from this date. */
export const BILLING_LAUNCH = '2026-11-06T00:00:00Z';

/** India pays in rupees, the UK in pounds, everyone else in US dollars. */
export type Currency = 'INR' | 'USD' | 'GBP';
export const CURRENCIES: { id: Currency; label: string; where: string }[] = [
  { id: 'INR', label: 'Indian rupees (₹)', where: 'India' },
  { id: 'GBP', label: 'Pounds sterling (£)', where: 'United Kingdom' },
  { id: 'USD', label: 'US dollars ($)', where: 'USA and the rest of the world' },
];
export const asCurrency = (c: string | null | undefined): Currency => (c === 'USD' || c === 'GBP' ? c : 'INR');
/** Older fixed-size plans: foreign clients pay in US dollars at this rate (rounded up to whole dollars). */
export const USD_RATE = 90;

/**
 * How the plan picker offers a bundle:
 *  - single: one portal (pick which);
 *  - pair:   any two of the five work portals (pick which two);
 *  - suite:  the company-type suite (Manufacturing or Production) or the Complete suite;
 *  - people: HR + Timesheet together;
 *  - legacy: no longer offered; kept so companies already on it keep their plan.
 */
export type BundleGroup = 'single' | 'pair' | 'suite' | 'people' | 'legacy';

export const BUNDLES: { id: Bundle; name: string; portals: string[]; desc: string; group: BundleGroup; best?: boolean }[] = [
  { id: 'timesheet', name: 'Timesheet', portals: ['timesheet'], group: 'single', desc: 'Weekly timesheets, roster, approvals, overtime and project hours' },
  { id: 'purchase', name: 'Purchase', portals: ['procurement'], group: 'single', desc: 'Requisitions, quotes, POs, stock, receipts and invoices' },
  { id: 'sales', name: 'Sales', portals: ['sales'], group: 'single', desc: 'Enquiries, costing, quotations, orders and collections' },
  { id: 'production', name: 'Production', portals: ['production'], group: 'single', desc: 'Work orders, trade forms, drawings and daily shop-floor reports' },
  { id: 'quality', name: 'Quality (QC)', portals: ['quality'], group: 'single', desc: 'Incoming and final inspections, NCRs and QC approval' },
  { id: 'hr', name: 'HR', portals: ['hr'], group: 'single', desc: 'Employee records, leave requests and approvals, leave balances and monthly attendance' },
  { id: 'both', name: 'Timesheet + Purchase', portals: ['timesheet', 'procurement'], group: 'pair', desc: 'Site hours and buying in one login' },
  { id: 'timesheet_sales', name: 'Timesheet + Sales', portals: ['timesheet', 'sales'], group: 'pair', desc: 'Win the work and track the hours on it' },
  { id: 'timesheet_production', name: 'Timesheet + Production', portals: ['timesheet', 'production'], group: 'pair', desc: 'Work orders and the hours booked to them' },
  { id: 'timesheet_quality', name: 'Timesheet + Quality', portals: ['timesheet', 'quality'], group: 'pair', desc: 'Inspections and the hours behind them' },
  { id: 'purchase_sales', name: 'Purchase + Sales', portals: ['procurement', 'sales'], group: 'pair', desc: 'Quote, win, then buy for the job' },
  { id: 'purchase_production', name: 'Purchase + Production', portals: ['procurement', 'production'], group: 'pair', desc: 'Material requests from the floor go straight to buying' },
  { id: 'purchase_quality', name: 'Purchase + Quality', portals: ['procurement', 'quality'], group: 'pair', desc: 'Goods received are inspected before they are accepted' },
  { id: 'sales_production', name: 'Sales + Production', portals: ['sales', 'production'], group: 'pair', desc: 'Orders and drawings go straight to the shop floor' },
  { id: 'sales_quality', name: 'Sales + Quality', portals: ['sales', 'quality'], group: 'pair', desc: 'Every order inspected before it is invoiced' },
  { id: 'production_quality', name: 'Production + Quality', portals: ['production', 'quality'], group: 'pair', desc: 'Make it and inspect it: work orders go straight to QC' },
  {
    id: 'factory',
    name: 'Manufacturing suite',
    portals: ['sales', 'procurement', 'production', 'quality'],
    group: 'suite',
    desc: 'Sales, Purchase, Production and Quality: from enquiry to inspected, dispatched job',
    best: true,
  },
  {
    id: 'complete',
    name: 'Complete suite',
    portals: ['timesheet', 'sales', 'procurement', 'production', 'quality'],
    group: 'suite',
    desc: 'All five work portals: the four job portals plus Timesheet',
  },
  { id: 'hr_timesheet', name: 'HR + Timesheet', portals: ['timesheet', 'hr'], group: 'people', desc: 'Hours, roster and overtime, with leave and attendance' },
  { id: 'all', name: 'Timesheet + Purchase + Sales', portals: ['timesheet', 'procurement', 'sales'], group: 'legacy', desc: 'One login, one GM dashboard' },
];
/** Each portal's own bundle, for "you save" against buying them separately. */
const SINGLE: Record<string, Bundle> = { timesheet: 'timesheet', procurement: 'purchase', sales: 'sales', production: 'production', quality: 'quality', hr: 'hr' };
/** Every portal that is sold in a plan. */
export const PRICED_PORTALS = Object.keys(SINGLE);
/** The portals a company can pair in a two-portal plan (HR pairs only with Timesheet, in the people plan). */
export const PAIR_PORTALS = ['sales', 'procurement', 'production', 'quality', 'timesheet'];
export const isCombo = (b: Bundle) => (bundleOf(b)?.portals.length ?? 0) > 1;
export const bundlesIn = (group: BundleGroup) => BUNDLES.filter((b) => b.group === group);
/** The bundle sold for exactly these portals (any order), if there is one. */
export function bundleForPortals(portals: string[]): Bundle | undefined {
  const want = [...new Set(portals)].sort().join('+');
  return BUNDLES.find((b) => b.group !== 'legacy' && [...b.portals].sort().join('+') === want)?.id;
}

/**
 * The suite's name follows the company type: machining, moulding and press tool shops see the
 * Production suite, everyone else the Manufacturing suite. Same portals, same price.
 */
export type CompanyType = 'manufacturing' | 'production';
export function bundleName(b: Bundle, type: CompanyType = 'manufacturing') {
  if (b === 'factory' && type === 'production') return 'Production suite';
  return bundleOf(b)?.name ?? b;
}
/** A stored plan's name as this company sees it (the suite follows the company type). */
export function planNameFor(id: string, type: CompanyType = 'manufacturing') {
  const p = planOf(id);
  if (!p) return undefined;
  return p.bundle === 'factory' ? p.name.replace(bundleOf('factory')!.name, bundleName('factory', type)) : p.name;
}
export function bundleDesc(b: Bundle, type: CompanyType = 'manufacturing') {
  if (b === 'factory' && type === 'production') return 'Sales, Purchase, Production and Quality: from RFQ to inspected, delivered parts';
  return bundleOf(b)?.desc ?? '';
}

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
// Two portals together cost about 20% less than separately; three about 30% less;
// the Manufacturing suite about 40% less and the Complete suite about 45% less.
// Older fixed-size plans only: bundles added later have no fixed-size price.
const MONTHLY_INR: Partial<Record<Bundle, Record<TierId, number>>> = {
  timesheet: { starter: 1199, growth: 2999, business: 6999 },
  purchase: { starter: 1799, growth: 4199, business: 9599 },
  sales: { starter: 1799, growth: 4199, business: 9599 },
  production: { starter: 1999, growth: 4699, business: 10499 },
  quality: { starter: 1299, growth: 2999, business: 6999 },
  both: { starter: 2399, growth: 5999, business: 13999 },
  timesheet_sales: { starter: 2399, growth: 5999, business: 13999 },
  purchase_sales: { starter: 2899, growth: 6799, business: 15499 },
  all: { starter: 3399, growth: 7999, business: 18499 },
  production_quality: { starter: 2599, growth: 5999, business: 13499 },
  factory: { starter: 3999, growth: 9499, business: 21999 },
  complete: { starter: 4499, growth: 10499, business: 24499 },
  // Older fixed sizes are no longer sold; HR has them only so every bundle has a price.
  hr: { starter: 1599, growth: 3999, business: 9299 },
  hr_timesheet: { starter: 2399, growth: 5999, business: 13999 },
};

/** Monthly price in the client's currency: rupees, or dollars at USD_RATE rounded up. */
export function monthly(b: Bundle, t: TierId, cur: Currency = 'INR') {
  const v = MONTHLY_INR[b]?.[t] ?? 0;
  return cur === 'INR' ? v : Math.ceil(v / USD_RATE);
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
export const UNPRICED_PORTALS: string[] = [];

/** Limits while on the free trial: every portal, Growth team size. */
export const TRIAL_LIMITS = { users: 40, portals: [...PRICED_PORTALS, ...UNPRICED_PORTALS] };

export const cycleOf = (c: string) => CYCLES.find((x) => x.id === c) ?? CYCLES[0];
export const bundleOf = (b: string) => BUNDLES.find((x) => x.id === b);
export const tierOf = (t: string) => TIERS.find((x) => x.id === t);
export const planId = (b: Bundle, t: PlanTier): PlanId => `${b}_${t}`;

/** Name, users and portals for a stored plan id like "factory_users" (per user) or "both_growth" (older). */
export function planOf(id: string) {
  const cut = id.lastIndexOf('_'); // bundle ids can contain "_" (purchase_sales_growth)
  const [b, t] = [id.slice(0, cut), id.slice(cut + 1)];
  const bundle = bundleOf(b);
  if (!bundle) return undefined;
  const portals = [...bundle.portals, ...UNPRICED_PORTALS];
  // Per-user plans have no people limit: the bill follows the number of people.
  if (t === 'users') return { id: id as PlanId, bundle: bundle.id, tier: 'users' as PlanTier, name: bundle.name, users: Number.POSITIVE_INFINITY, portals, perUser: true };
  const tier = tierOf(t);
  if (!tier) return undefined;
  return { id: id as PlanId, bundle: bundle.id, tier: tier.id as PlanTier, name: `${bundle.name} ${tier.name}`, users: tier.users, portals, perUser: false };
}

/** Display name of a portal id. */
export const portalName = (p: string) => (({ procurement: 'Purchase', timesheet: 'Timesheet', sales: 'Sales', production: 'Production', quality: 'Quality', hr: 'HR' }) as Record<string, string>)[p] ?? p;

/** Portals in use that a plan does not include: they are paused when the company moves to it. */
export function portalsOutside(id: string, inUse: string[]) {
  const plan = planOf(id);
  return plan ? inUse.filter((p) => !plan.portals.includes(p)) : [];
}

/** Amount charged each cycle, in the client's currency (per-user plans: for `seats` people). */
export function priceFor(b: Bundle, t: PlanTier, cycle: Cycle, cur: Currency = 'INR', seats = MIN_SEATS) {
  if (t === 'users') return seatQuote(b, seats, cycle, cur).total;
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
  const fits = BUNDLES.filter((b) => b.group !== 'legacy' && used.every((p) => b.portals.includes(p) || !SINGLE[p]));
  // Fewest portals first; of those, the cheapest.
  return fits.sort((a, b) => a.portals.length - b.portals.length || SEAT_PRICE[a.id].INR - SEAT_PRICE[b.id].INR)[0]?.id ?? 'complete';
}

/** Money in the client's currency, e.g. ₹5,999 or $67. */
export function money(v: number, cur: Currency = 'INR') {
  const opts = { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 };
  if (cur === 'USD') return `$${v.toLocaleString('en-US', opts)}`;
  if (cur === 'GBP') return `£${v.toLocaleString('en-GB', opts)}`;
  return `₹${v.toLocaleString('en-IN', opts)}`;
}
/** Rupees (older callers). */
export const inr = (v: number) => money(v, 'INR');
export const taxNote = (cur: Currency) => (cur === 'USD' ? 'Prices in US dollars, taxes extra where they apply' : cur === 'GBP' ? 'Prices in pounds, VAT extra' : 'GST extra');
export const currencySymbol = (cur: Currency) => (cur === 'USD' ? '$' : cur === 'GBP' ? '£' : '₹');
/** "US dollars" etc., for sentences. */
export const currencyWords = (cur: Currency) => (cur === 'USD' ? 'US dollars' : cur === 'GBP' ? 'pounds sterling' : 'Indian rupees');

// ---------------------------------------------------------------------------------------------
// Per-user pricing (the current plans). Change prices here only.
// ---------------------------------------------------------------------------------------------

/** Price per person per month, paid monthly, in each currency. */
export const SEAT_PRICE: Record<Bundle, Record<Currency, number>> = {
  timesheet: { INR: 149, USD: 1.99, GBP: 1.99 },
  quality: { INR: 299, USD: 4.99, GBP: 3.99 },
  purchase: { INR: 399, USD: 6.99, GBP: 5.99 },
  sales: { INR: 399, USD: 6.99, GBP: 5.99 },
  production: { INR: 499, USD: 8.99, GBP: 7.99 },
  both: { INR: 449, USD: 7.99, GBP: 6.99 },
  timesheet_sales: { INR: 449, USD: 7.99, GBP: 6.99 },
  purchase_sales: { INR: 699, USD: 11.99, GBP: 9.99 },
  production_quality: { INR: 599, USD: 11.99, GBP: 9.99 },
  all: { INR: 749, USD: 12.99, GBP: 10.99 },
  factory: { INR: 999, USD: 19.99, GBP: 16.99 },
  complete: { INR: 1149, USD: 21.99, GBP: 18.99 },
  hr: { INR: 199, USD: 2.99, GBP: 2.49 },
  hr_timesheet: { INR: 299, USD: 3.99, GBP: 3.49 },
  // Any two portals: about 15% to 25% less than buying them one by one.
  timesheet_production: { INR: 549, USD: 9.49, GBP: 8.49 },
  timesheet_quality: { INR: 349, USD: 5.99, GBP: 4.99 },
  purchase_production: { INR: 749, USD: 13.99, GBP: 11.99 },
  purchase_quality: { INR: 599, USD: 9.99, GBP: 8.49 },
  sales_production: { INR: 749, USD: 13.99, GBP: 11.99 },
  sales_quality: { INR: 599, USD: 9.99, GBP: 8.49 },
};
/** Smallest number of people a company pays for. */
export const MIN_SEATS = 5;
/** People with the management role (GM, directors) who use SteelConnect360 free: they view, hold and comment. */
export const FREE_VIEWERS = 2;
/** Bigger teams pay less per person: each band is priced at its own rate (like tax bands). */
export const VOLUME_BANDS: { from: number; to: number; discount: number; label: string }[] = [
  { from: 1, to: 25, discount: 0, label: 'First 25 seats' },
  { from: 26, to: 100, discount: 0.15, label: 'Seats 26 to 100 (15% off)' },
  { from: 101, to: Number.POSITIVE_INFINITY, discount: 0.25, label: 'Seats 101 and more (25% off)' },
];

/** Whole rupees; pence and cents to 2 decimals. */
export const roundMoney = (v: number, cur: Currency) => (cur === 'INR' ? Math.round(v) : Math.round(v * 100) / 100);

/** People billed: everyone active, less up to FREE_VIEWERS management viewers, and never fewer than MIN_SEATS. */
export const billableSeats = (activePeople: number, managementPeople = 0) => Math.max(MIN_SEATS, activePeople - Math.min(FREE_VIEWERS, managementPeople));

/**
 * The bill for `seats` people on a bundle: each volume band at its own rate, then the
 * longer-term discount. `lines` explains the sum on screen.
 */
export function seatQuote(b: Bundle, seats: number, cycle: Cycle, cur: Currency) {
  const n = Math.max(MIN_SEATS, Math.floor(seats));
  const unit = SEAT_PRICE[b][cur];
  const c = cycleOf(cycle);
  const lines = VOLUME_BANDS.map((band) => {
    const people = Math.max(0, Math.min(n, band.to) - band.from + 1);
    const each = roundMoney(unit * (1 - band.discount), cur);
    return { label: band.label, people, each, amount: roundMoney(people * each, cur) };
  }).filter((l) => l.people > 0);
  const perMonth = roundMoney(lines.reduce((t, l) => t + l.amount, 0), cur);
  const total = roundMoney(perMonth * c.months * (1 - c.discount), cur);
  return { seats: n, unit, lines, perMonth, months: c.months, total, saving: roundMoney(perMonth * c.months - total, cur) };
}

/** Per-person price of a bundle's portals bought one by one. */
export const seatSeparately = (b: Bundle, cur: Currency) => roundMoney((bundleOf(b)?.portals ?? []).reduce((n, p) => n + SEAT_PRICE[SINGLE[p]][cur], 0), cur);
/** A combined bundle's saving against buying its portals one by one, as a whole percentage. */
export const seatSavingPct = (b: Bundle, cur: Currency = 'INR') => (isCombo(b) ? Math.round((1 - SEAT_PRICE[b][cur] / seatSeparately(b, cur)) * 100) : 0);
/** Lowest per-person price in a group of bundles, for "from ₹149" labels. */
export const groupFrom = (group: BundleGroup, cur: Currency) => Math.min(...bundlesIn(group).map((b) => SEAT_PRICE[b.id][cur]));
/** Biggest saving in a group of bundles, for "save up to 25%" labels. */
export const groupMaxSaving = (group: BundleGroup, cur: Currency) => Math.max(0, ...bundlesIn(group).map((b) => seatSavingPct(b.id, cur)));

/** A yearly price paid monthly: 12 equal payments (rounded up to the whole rupee or dollar). */
export const installmentOf = (yearly: number) => Math.ceil(yearly / 12);

/**
 * Price of `add` more seats on top of `have`: what they add to each renewal (priced in the volume
 * band they fall in), and what is due now for the part of the current period that is left.
 */
export function extraSeatsQuote(bundle: Bundle, have: number, add: number, cycle: Cycle, currency: Currency, periodEnd: Date | null, now = Date.now()) {
  const perCycle = roundMoney(seatQuote(bundle, have + add, cycle, currency).total - seatQuote(bundle, have, cycle, currency).total, currency);
  const months = cycleOf(cycle).months;
  const end = periodEnd?.getTime() ?? 0;
  const start = periodEnd ? new Date(periodEnd).setMonth(periodEnd.getMonth() - months) : 0;
  const left = end > now && end > start ? Math.min(1, (end - now) / (end - start)) : 0;
  return { perCycle, dueNow: roundMoney(perCycle * left, currency), daysLeft: Math.max(0, Math.ceil((end - now) / 864e5)) };
}
