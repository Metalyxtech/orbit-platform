import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';

// Accounting connections (migration 0037): Sales invoices and Purchase bills sent to the company's
// accounts software (Zoho Books, QuickBooks Online, Xero) or exported for Tally. Tokens are stored
// encrypted by the app; nothing here is readable without the app's key.

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const companyId = () =>
  uuid('company_id')
    .notNull()
    .references(() => companies.id);

export type AcctProvider = 'tally' | 'zoho' | 'quickbooks' | 'xero';

/** One row per company and accounts software. At most one is `active` at a time. */
export const acctConnections = pgTable(
  'acct_connections',
  {
    id: id(),
    companyId: companyId(),
    provider: text('provider').$type<AcctProvider>().notNull(),
    active: boolean('active').notNull().default(true),
    /** connected | error (needs reconnecting) */
    status: text('status').notNull().default('connected'),
    /** Zoho organisation id, QuickBooks realm id or Xero tenant id. */
    orgId: text('org_id'),
    orgName: text('org_name'),
    /** Where the provider's API lives for this company (Zoho data centre). */
    apiBase: text('api_base'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Accounts, taxes, ledgers and options chosen on the Accounting page. */
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    lastError: text('last_error'),
    connectedBy: uuid('connected_by').references(() => memberships.id),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('acct_connections_provider').on(t.companyId, t.provider)],
);

/** What was sent where: one row per document and accounts software. */
export const acctSync = pgTable(
  'acct_sync',
  {
    id: id(),
    companyId: companyId(),
    provider: text('provider').$type<AcctProvider>().notNull(),
    /** sales_invoice | purchase_bill */
    kind: text('kind').notNull(),
    docId: uuid('doc_id').notNull(),
    docNumber: text('doc_number').notNull(),
    /** sent | failed | exported (Tally file) */
    status: text('status').notNull(),
    externalId: text('external_id'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(1),
    byId: uuid('by_id').references(() => memberships.id),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('acct_sync_doc').on(t.companyId, t.provider, t.kind, t.docId), index('acct_sync_status').on(t.companyId, t.status)],
);
