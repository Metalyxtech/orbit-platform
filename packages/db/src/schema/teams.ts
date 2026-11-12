import { sql } from 'drizzle-orm';
import { index, pgTable, primaryKey, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';
import { salesOrders } from './sales';

// Project teams (migration 0029): who works on which project (a won sales order).

export const projectTeams = pgTable(
  'project_teams',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    salesOrderId: uuid('sales_order_id')
      .notNull()
      .references(() => salesOrders.id),
    createdBy: uuid('created_by').references(() => memberships.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('project_teams_order').on(t.companyId, t.salesOrderId)],
);

export const projectTeamMembers = pgTable(
  'project_team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => projectTeams.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.membershipId] }), index('project_team_members_member').on(t.companyId, t.membershipId)],
);
