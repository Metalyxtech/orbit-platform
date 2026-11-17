import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';

// Quality portal (migration 0025). Inspection requests come from other portals through
// @orbit/core/quality, so Purchase and Production never import the Quality portal.

const at = (name = 'created_at') => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const member = (name: string) => uuid(name).references(() => memberships.id);

export const qcSettings = pgTable('qc_settings', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id),
  config: jsonb('config').notNull().default({}),
  seq: integer('seq').notNull().default(0),
  updatedAt: at('updated_at'),
});

/**
 * One inspection: what to check (from the source portal), the QC engineer's findings and result,
 * and the QC manager's final approval.
 */
export const qcInspections = pgTable(
  'qc_inspections',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    number: text('number').notNull(),
    /** purchase (incoming material) | production (finished work) */
    source: text('source').notNull(),
    /** Purchase request id or work order id. */
    sourceId: uuid('source_id').notNull(),
    /** PO / PR number or WO number, for display. */
    sourceRef: text('source_ref').notNull(),
    title: text('title').notNull(),
    /** Supplier (purchase) or customer (production). */
    party: text('party'),
    /** [{ label, value }] facts from the source: trade form, delivery note, project... */
    details: jsonb('details').notNull().default([]),
    /** [{ item, qty, unit }] */
    items: jsonb('items').notNull().default([]),
    /** Checklist items to inspect (strings). */
    checklist: jsonb('checklist').notNull().default([]),
    /** [{ name, url }] files the QC engineer opens: drawings, quotations, certificates. */
    documents: jsonb('documents').notNull().default([]),
    /** 1 for the first inspection, 2+ for re-inspections after a fail. */
    round: integer('round').notNull().default(1),
    /** pending (with the QC engineer) | submitted (with the QC manager) | approved (final) | cancelled */
    status: text('status').notNull().default('pending'),
    /** pass | fail */
    result: text('result'),
    /** [{ item, ok, note }] */
    findings: jsonb('findings').notNull().default([]),
    remarks: text('remarks'),
    /** Non-conformance description when it failed. */
    ncr: text('ncr'),
    /** Why the QC manager sent the report back to the engineer. */
    returnNote: text('return_note'),
    inspectorId: member('inspector_id'),
    inspectedAt: timestamp('inspected_at', { withTimezone: true }),
    approverId: member('approver_id'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approverNote: text('approver_note'),
    requestedBy: member('requested_by'),
    createdAt: at(),
    updatedAt: at('updated_at'),
  },
  (t) => [uniqueIndex('qc_inspections_number').on(t.companyId, t.number), index('qc_inspections_status').on(t.companyId, t.status), index('qc_inspections_source').on(t.companyId, t.source, t.sourceId)],
);

export const qcEvents = pgTable(
  'qc_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => qcInspections.id),
    text: text('text').notNull(),
    byId: member('by_id'),
    createdAt: at(),
  },
  (t) => [index('qc_events_insp').on(t.companyId, t.inspectionId, t.createdAt)],
);
