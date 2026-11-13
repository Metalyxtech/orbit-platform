import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';

/** A person's role inside one portal (for example Purchase: buyer, storekeeper). Migration 0010. */
export const portalRoles = pgTable(
  'portal_roles',
  {
    companyId: uuid('company_id').notNull().references(() => companies.id),
    membershipId: uuid('membership_id').notNull().references(() => memberships.id),
    portal: text('portal').notNull(),
    role: text('role').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.membershipId, t.portal] })],
);
