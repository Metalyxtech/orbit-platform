import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';

// Production portal. Every table carries company_id and is under RLS (migration 0023).
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const companyId = () => uuid('company_id').notNull().references(() => companies.id);
const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: 'number' });
const at = (name = 'created_at') => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const member = (name: string) => uuid(name).references(() => memberships.id);

/** Company configuration (trades in use, numbering) and document counters. */
export const prodSettings = pgTable('prod_settings', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id),
  config: jsonb('config').notNull(),
  woSeq: integer('wo_seq').notNull().default(1000),
  qcSeq: integer('qc_seq').notNull().default(0),
  ncrSeq: integer('ncr_seq').notNull().default(0),
  updatedAt: at('updated_at'),
});

/** A work order: what to make, for whom, how many, by when, on which trade's form. */
export const prodWorkOrders = pgTable(
  'prod_work_orders',
  {
    id: id(),
    companyId: companyId(),
    number: text('number').notNull(),
    trade: text('trade').notNull(),
    title: text('title').notNull(),
    customer: text('customer'),
    /** The won sales order it was made from (Sales portal), if any. */
    salesOrderId: uuid('sales_order_id'),
    qty: qty('qty').notNull(),
    unit: text('unit').notNull(),
    due: date('due'),
    /** low | normal | high | urgent */
    priority: text('priority').notNull().default('normal'),
    /** draft | pending_release | released | in_progress | final_qc | completed | dispatched | cancelled */
    status: text('status').notNull().default('draft'),
    /** The trade form's answers (field id -> value). */
    fields: jsonb('fields').notNull().default({}),
    notes: text('notes'),
    /** Why the manager sent the draft back (cleared on the next submit). */
    returnedNote: text('returned_note'),
    createdBy: member('created_by'),
    releasedBy: member('released_by'),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    createdAt: at(),
    updatedAt: at('updated_at'),
  },
  (t) => [uniqueIndex('prod_work_orders_number').on(t.companyId, t.number), index('prod_work_orders_status').on(t.companyId, t.status)],
);

/** Routing: the operations a work order goes through, with output so far. */
export const prodOperations = pgTable(
  'prod_operations',
  {
    id: id(),
    companyId: companyId(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => prodWorkOrders.id),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    qcRequired: boolean('qc_required').notNull().default(false),
    doneQty: qty('done_qty').notNull().default(0),
    hours: numeric('hours', { precision: 10, scale: 2, mode: 'number' }).notNull().default(0),
    /** pending | running | awaiting_qc | done | rework */
    status: text('status').notNull().default('pending'),
  },
  (t) => [index('prod_operations_wo').on(t.workOrderId, t.position)],
);

/** Bill of materials for a work order, with what the store has issued. */
export const prodMaterials = pgTable(
  'prod_materials',
  {
    id: id(),
    companyId: companyId(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => prodWorkOrders.id),
    position: integer('position').notNull(),
    item: text('item').notNull(),
    qty: qty('qty').notNull(),
    unit: text('unit').notNull(),
    issuedQty: qty('issued_qty').notNull().default(0),
  },
  (t) => [index('prod_materials_wo').on(t.workOrderId, t.position)],
);

/** Each issue (or return, negative) of material from the store. */
export const prodIssues = pgTable('prod_issues', {
  id: id(),
  companyId: companyId(),
  workOrderId: uuid('work_order_id')
    .notNull()
    .references(() => prodWorkOrders.id),
  materialId: uuid('material_id')
    .notNull()
    .references(() => prodMaterials.id),
  qty: qty('qty').notNull(),
  note: text('note'),
  byId: member('by_id'),
  createdAt: at(),
});

/** Daily production report lines: output and hours per operation per day. */
export const prodReports = pgTable(
  'prod_reports',
  {
    id: id(),
    companyId: companyId(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => prodWorkOrders.id),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => prodOperations.id),
    day: date('day').notNull(),
    qty: qty('qty').notNull(),
    hours: numeric('hours', { precision: 10, scale: 2, mode: 'number' }).notNull().default(0),
    workers: integer('workers').notNull().default(0),
    shift: text('shift'),
    remarks: text('remarks'),
    byId: member('by_id'),
    createdAt: at(),
  },
  (t) => [index('prod_reports_day').on(t.companyId, t.day)],
);

/** QC inspection of an operation (or the final inspection when operationId is null). */
export const prodInspections = pgTable('prod_inspections', {
  id: id(),
  companyId: companyId(),
  workOrderId: uuid('work_order_id')
    .notNull()
    .references(() => prodWorkOrders.id),
  operationId: uuid('operation_id').references(() => prodOperations.id),
  number: text('number').notNull(),
  /** pass | fail */
  result: text('result').notNull(),
  /** [{ item, ok, note }] from the trade's QC checklist */
  checklist: jsonb('checklist').notNull().default([]),
  remarks: text('remarks'),
  byId: member('by_id'),
  createdAt: at(),
});

/** Non-conformance report raised by a failed inspection; closed when the rework passes. */
export const prodNcrs = pgTable('prod_ncrs', {
  id: id(),
  companyId: companyId(),
  workOrderId: uuid('work_order_id')
    .notNull()
    .references(() => prodWorkOrders.id),
  inspectionId: uuid('inspection_id').references(() => prodInspections.id),
  operationId: uuid('operation_id').references(() => prodOperations.id),
  number: text('number').notNull(),
  description: text('description').notNull(),
  action: text('action'),
  /** open | closed */
  status: text('status').notNull().default('open'),
  closedBy: member('closed_by'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: at(),
});

/** Timeline of everything that happened on a work order. */
export const prodEvents = pgTable(
  'prod_events',
  {
    id: id(),
    companyId: companyId(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => prodWorkOrders.id),
    text: text('text').notNull(),
    byId: member('by_id'),
    createdAt: at(),
  },
  (t) => [index('prod_events_wo').on(t.companyId, t.workOrderId, t.createdAt)],
);

/** Workshop drawings and documents on a work order: uploaded files (S3) or links to bigger files. */
export const prodDocs = pgTable(
  'prod_docs',
  {
    id: id(),
    companyId: companyId(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => prodWorkOrders.id),
    /** file | link */
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    url: text('url'),
    s3Key: text('s3_key'),
    contentType: text('content_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    uploaded: boolean('uploaded').notNull().default(false),
    byId: member('by_id'),
    createdAt: at(),
  },
  (t) => [index('prod_docs_wo').on(t.companyId, t.workOrderId)],
);
