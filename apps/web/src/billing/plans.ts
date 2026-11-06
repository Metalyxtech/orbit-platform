// Orbit subscription plans. Prices in rupees (GST extra). Change prices, limits and features here only.
// Safe to import from client components.

export type PlanId = 'starter' | 'growth' | 'business';
export type Cycle = 'monthly' | 'yearly';

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Price per month when billed monthly (₹). */
  monthly: number;
  /** Price per year when billed yearly (₹): two months free. */
  yearly: number;
  users: number;
  portals: number;
  popular?: boolean;
  features: string[];
}

export const TRIAL_DAYS = 30;
export const CURRENCY = '₹';

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For small teams getting started',
    monthly: 1999,
    yearly: 19990,
    users: 10,
    portals: 1,
    features: ['Up to 10 people', 'One portal (Timesheet or Purchase)', 'Approval workflows', 'Dashboards and reports', 'Email support'],
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'For growing companies running several teams',
    monthly: 4999,
    yearly: 49990,
    users: 40,
    portals: 99,
    popular: true,
    features: [
      'Up to 40 people',
      'All portals: Timesheet and Purchase',
      'Approval matrix and industry forms',
      'GM dashboards with charts',
      'Change history and notifications',
      'Priority email support',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    tagline: 'For larger companies and multiple sites',
    monthly: 11999,
    yearly: 119990,
    users: 150,
    portals: 99,
    features: ['Up to 150 people', 'Everything in Growth', 'Dedicated onboarding session', 'Phone and WhatsApp support', 'Early access to new portals'],
  },
];

/** Limits while on the free trial (Growth features). */
export const TRIAL_LIMITS = { users: 40, portals: 99 };

export const planById = (id: string) => PLANS.find((p) => p.id === id);
export const priceOf = (p: Plan, cycle: Cycle) => (cycle === 'yearly' ? p.yearly : p.monthly);
export const perMonth = (p: Plan, cycle: Cycle) => (cycle === 'yearly' ? Math.round(p.yearly / 12) : p.monthly);
export const yearlySaving = (p: Plan) => p.monthly * 12 - p.yearly;
export const inr = (v: number) => `${CURRENCY}${v.toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
