import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';
import { prodReports } from './production';

/**
 * What kind of company it is (migration 0035): 'manufacturing' (steel fabrication, piping and project
 * companies, the original set) or 'production' (machining, moulding and press tool shops). It decides
 * which portals, forms and subscription plans the company sees. No row = manufacturing.
 */
export const companyProfile = pgTable('company_profile', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id),
  industry: text('industry').notNull().default(sql`'manufacturing'`),
  /** Languages the company offers its people, default first (migration 0038). */
  languages: text('languages').array().notNull().default(sql`ARRAY['en']::text[]`),
  /** Languages Super Admin allows this company to offer (migration 0039). Null = all languages. */
  allowedLanguages: text('allowed_languages').array(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Shop-floor measures for production trades, one row per production report (migration 0035). */
export const prodReportMeasures = pgTable('prod_report_measures', {
  reportId: uuid('report_id')
    .primaryKey()
    .references(() => prodReports.id),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  measures: jsonb('measures').$type<Record<string, string | number>>().notNull().default({}),
});

/** Each person's own settings in a company: the language they picked (migration 0038). */
export const memberPrefs = pgTable('member_prefs', {
  membershipId: uuid('membership_id')
    .primaryKey()
    .references(() => memberships.id),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  language: text('language'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
