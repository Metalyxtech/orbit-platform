import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './platform';

/** Razorpay plan ids, created on first use per plan and billing cycle (global, no company). Migration 0011. */
export const billingPlans = pgTable('billing_plans', {
  key: text('key').primaryKey(), // e.g. growth_monthly
  razorpayPlanId: text('razorpay_plan_id').notNull(),
  amount: integer('amount').notNull(), // paise
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One subscription per company. No row = free trial counted from the company's sign-up. */
export const companySubscriptions = pgTable('company_subscriptions', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id),
  plan: text('plan').notNull(),
  cycle: text('cycle').notNull(), // monthly | quarterly | halfyearly | yearly
  /** created | authenticated | active | pending | halted | cancelled | completed (Razorpay states). */
  status: text('status').notNull(),
  razorpaySubscriptionId: text('razorpay_subscription_id').unique(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Payments and subscription events, for the billing history. */
export const billingEvents = pgTable(
  'billing_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    type: text('type').notNull(),
    razorpayId: text('razorpay_id'),
    amount: integer('amount'), // paise
    data: jsonb('data'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('billing_events_company').on(t.companyId, t.createdAt)],
);
