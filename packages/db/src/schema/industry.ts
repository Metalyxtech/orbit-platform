import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './platform';
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
