import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';
import { projects } from './timesheet';

/** Messages and review comments between people of one company. */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    fromId: uuid('from_id').notNull().references(() => memberships.id),
    toId: uuid('to_id').notNull().references(() => memberships.id),
    kind: text('kind').$type<'message' | 'review'>().notNull().default('message'),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    projectId: uuid('project_id').references(() => projects.id),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_inbox').on(t.companyId, t.toId, t.createdAt), index('messages_sent').on(t.companyId, t.fromId, t.createdAt)],
);
