import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies, users } from './platform';

/**
 * Terms and Conditions / Privacy Policy acceptances: one row per person, document and version.
 * company_id is the company the person was in when they signed (null before they joined one).
 * Visible to the person, their company, and Super Admin. Migration 0013.
 */
export const legalAcceptances = pgTable(
  'legal_acceptances',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    companyId: uuid('company_id').references(() => companies.id),
    document: text('document').notNull(), // terms | privacy
    version: text('version').notNull(),
    /** The full name the person typed as their signature. */
    signedName: text('signed_name').notNull(),
    /** company_admin signs on behalf of the company; everyone else for themselves. */
    role: text('role'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('legal_acceptances_user').on(t.userId, t.document), index('legal_acceptances_company').on(t.companyId, t.acceptedAt)],
);
