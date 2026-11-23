import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';

// GM process control (migration 0028): holds and comments on any process in any portal.
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const companyId = () => uuid('company_id').notNull().references(() => companies.id);
const member = (name: string) => uuid(name).references(() => memberships.id);
const at = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

/** A process stopped by the GM (or company admin) until it is resumed. */
export const processHolds = pgTable(
  'process_holds',
  {
    id: id(),
    companyId: companyId(),
    portal: text('portal').notNull(),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    ref: text('ref').notNull(),
    title: text('title').notNull(),
    href: text('href').notNull(),
    status: text('status').$type<'held' | 'released'>().notNull().default('held'),
    reason: text('reason').notNull(),
    heldBy: member('held_by').notNull(),
    heldAt: at('held_at'),
    releasedBy: member('released_by'),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releaseNote: text('release_note'),
  },
  (t) => [index('process_holds_entity').on(t.companyId, t.entity, t.entityId, t.status)],
);

/** Comments on a process (and the hold / resume notes), shown to everyone working on it. */
export const processComments = pgTable(
  'process_comments',
  {
    id: id(),
    companyId: companyId(),
    portal: text('portal').notNull(),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    ref: text('ref').notNull(),
    title: text('title').notNull(),
    href: text('href').notNull(),
    kind: text('kind').$type<'comment' | 'hold' | 'release'>().notNull().default('comment'),
    text: text('text').notNull(),
    byId: member('by_id').notNull(),
    createdAt: at('created_at'),
  },
  (t) => [index('process_comments_entity').on(t.companyId, t.entity, t.entityId, t.createdAt)],
);
