import { sql } from 'drizzle-orm';
import { index, pgTable, primaryKey, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';
import { salesOrders } from './sales';
import { projects } from './timesheet';

// Project teams (migration 0029): who works on which project (a sales order, or a company project).

export const projectTeams = pgTable(
  'project_teams',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    /** A project from Sales (won order) … */
    salesOrderId: uuid('sales_order_id').references(() => salesOrders.id),
    /** … or from the company project list, for companies without the Sales portal. */
    projectId: uuid('project_id').references(() => projects.id),
    createdBy: uuid('created_by').references(() => memberships.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('project_teams_order').on(t.companyId, t.salesOrderId), uniqueIndex('project_teams_project').on(t.companyId, t.projectId)],
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
