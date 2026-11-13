import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';

/** Which form each role uses in a portal, chosen by the company admin (migration 0009). */
export const portalForms = pgTable(
  'portal_forms',
  {
    companyId: uuid('company_id').notNull().references(() => companies.id),
    portal: text('portal').notNull(),
    role: text('role').notNull(),
    formId: text('form_id').notNull(),
    updatedBy: uuid('updated_by').references(() => memberships.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.portal, t.role] })],
);
