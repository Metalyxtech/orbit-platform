import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';

/**
 * Custom work for customers who need their own forms or portal (migration 0015).
 * Kept apart from the normal portals' tables on purpose.
 */

/** A company's custom deal, set by Super Admin: switched on, its own price, and limits. */
export const customPlans = pgTable('custom_plans', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id),
  /** On: the company is a custom customer (sees "Custom requirements" and its custom plan). */
  enabled: boolean('enabled').notNull().default(false),
  /** Shown to the customer, e.g. "Custom fabrication portal". */
  label: text('label').notNull().default('Custom plan'),
  /** Price per month / per year in the company's currency (whole rupees or dollars); null = not offered. */
  monthlyPrice: integer('monthly_price'),
  yearlyPrice: integer('yearly_price'),
  /** People allowed on the custom plan; null = no limit. */
  maxUsers: integer('max_users'),
  /** Internal note for Orbit (what is included). */
  note: text('note'),
  /** Unused value of their old plan, taken off the first yearly payment of this plan (migration 0017). */
  yearlyCredit: integer('yearly_credit').notNull().default(0),
  creditUsedAt: timestamp('credit_used_at', { withTimezone: true }),
  /** The yearly price may also be paid monthly: 12 payments, 12-month term (migration 0018). */
  allowInstallments: boolean('allow_installments').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** What a custom customer asked for: description plus their forms as images or PDFs. */
export const customRequests = pgTable(
  'custom_requests',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    requestedBy: uuid('requested_by').references(() => memberships.id),
    requestedName: text('requested_name').notNull(),
    title: text('title').notNull(),
    details: text('details').notNull(),
    /** Which portal it relates to: timesheet, procurement, or new (a custom portal). */
    area: text('area').notNull(),
    /** new | reviewing | quoted | approved | in_progress | ready | declined */
    status: text('status').notNull().default('new'),
    /** Orbit's reply to the customer. */
    orbitNote: text('orbit_note'),
    /** The price Orbit sent (migration 0017): the combined custom plan, monthly and/or yearly. */
    quoteLabel: text('quote_label'),
    quoteMonthly: integer('quote_monthly'),
    quoteYearly: integer('quote_yearly'),
    /** Taken off the first yearly payment: what is left of the yearly plan they already paid. */
    quoteCredit: integer('quote_credit').notNull().default(0),
    quoteNote: text('quote_note'),
    /** The quoted yearly price may also be paid in 12 monthly payments. */
    quoteInstallments: boolean('quote_installments').notNull().default(false),
    quotedAt: timestamp('quoted_at', { withTimezone: true }),
    /** When and by whom the customer approved or declined the price. */
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => memberships.id),
    /** The customer's answer: true approved, false declined, null not answered. */
    quoteApproved: boolean('quote_approved'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('custom_requests_company').on(t.companyId, t.createdAt)],
);

/** Files attached to a request (stored in S3 under the company prefix). */
export const customRequestFiles = pgTable(
  'custom_request_files',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    requestId: uuid('request_id')
      .notNull()
      .references(() => customRequests.id),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    s3Key: text('s3_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    /** False until the browser finished uploading to S3. */
    uploaded: boolean('uploaded').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('custom_request_files_request').on(t.requestId)],
);
