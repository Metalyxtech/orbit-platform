import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';

// Purchase (procurement) portal. Every table carries company_id and is under RLS (migration 0010).
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const companyId = () => uuid('company_id').notNull().references(() => companies.id);
const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: 'number' });
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: 'number' });
const at = (name = 'created_at') => timestamp(name, { withTimezone: true }).notNull().defaultNow();

/** Company configuration: industry form, workflow switches, approval levels, money and numbering (JSON). */
export const procSettings = pgTable('proc_settings', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id),
  config: jsonb('config').notNull(),
  prSeq: integer('pr_seq').notNull().default(1000),
  poSeq: integer('po_seq').notNull().default(2000),
  updatedAt: at('updated_at'),
});

export const procSuppliers = pgTable('proc_suppliers', {
  id: id(),
  companyId: companyId(),
  name: text('name').notNull(),
  categories: text('categories').notNull().default(''),
  email: text('email'),
  phone: text('phone'),
  rating: numeric('rating', { precision: 3, scale: 1, mode: 'number' }),
  active: boolean('active').notNull().default(true),
  createdAt: at(),
});

export const procItems = pgTable(
  'proc_items',
  {
    id: id(),
    companyId: companyId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull().default('General'),
    unit: text('unit').notNull(),
    onHand: qty('on_hand').notNull().default(0),
    reserved: qty('reserved').notNull().default(0),
    reorderLevel: qty('reorder_level').notNull().default(0),
    location: text('location'),
    avgCost: money('avg_cost').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('proc_items_code').on(t.companyId, t.code)],
);

/** Stock ledger: IN, OUT, RET (return), ADJ (adjustment). qty is signed. */
export const procMoves = pgTable(
  'proc_moves',
  {
    id: id(),
    companyId: companyId(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => procItems.id),
    type: text('type').$type<'IN' | 'OUT' | 'RET' | 'ADJ'>().notNull(),
    qty: qty('qty').notNull(),
    balanceAfter: qty('balance_after').notNull(),
    reference: text('reference'),
    note: text('note'),
    byId: uuid('by_id').references(() => memberships.id),
    createdAt: at(),
  },
  (t) => [index('proc_moves_item').on(t.companyId, t.itemId, t.createdAt)],
);

export type ProcStage =
  | 'draft'
  | 'stock_check'
  | 'pr_approval'
  | 'rfq'
  | 'po_approval'
  | 'issue'
  | 'receiving'
  | 'inspection'
  | 'invoice'
  | 'stock_issue'
  | 'closed'
  | 'rejected';

export const procRequests = pgTable(
  'proc_requests',
  {
    id: id(),
    companyId: companyId(),
    number: text('number').notNull(),
    title: text('title').notNull(),
    project: text('project').notNull(),
    needBy: date('need_by').notNull(),
    priority: text('priority').$type<'Normal' | 'Urgent'>().notNull().default('Normal'),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => memberships.id),
    stage: text('stage').$type<ProcStage>().notNull().default('draft'),
    stageAt: at('stage_at'),
    header: jsonb('header').notNull().default({}),
    awardQuoteId: uuid('award_quote_id'),
    poNo: text('po_no'),
    poDate: date('po_date'),
    /** { no, amount, expected, variancePct, override } once the invoice is matched. */
    invoice: jsonb('invoice'),
    createdAt: at(),
  },
  (t) => [index('proc_requests_stage').on(t.companyId, t.stage), uniqueIndex('proc_requests_number').on(t.companyId, t.number)],
);

export const procLines = pgTable(
  'proc_lines',
  {
    id: id(),
    companyId: companyId(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => procRequests.id),
    sort: integer('sort').notNull().default(0),
    itemId: uuid('item_id').references(() => procItems.id),
    description: text('description').notNull(),
    qty: qty('qty').notNull(),
    /** Quantity to purchase after the stock check (null = not checked yet, all of qty). */
    buyQty: qty('buy_qty'),
    unit: text('unit').notNull(),
    estRate: money('est_rate').notNull().default(0),
    values: jsonb('values').notNull().default({}),
    reservedQty: qty('reserved_qty').notNull().default(0),
    /** none | reserved | issued | released */
    reserveState: text('reserve_state').notNull().default('none'),
  },
  (t) => [index('proc_lines_request').on(t.companyId, t.requestId)],
);

export const procQuotes = pgTable('proc_quotes', {
  id: id(),
  companyId: companyId(),
  requestId: uuid('request_id')
    .notNull()
    .references(() => procRequests.id),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => procSuppliers.id),
  /** Rate per line, in line order. */
  rates: jsonb('rates').$type<number[]>().notNull(),
  leadDays: integer('lead_days'),
  terms: text('terms'),
  byId: uuid('by_id').references(() => memberships.id),
  createdAt: at(),
});

export const procReceipts = pgTable('proc_receipts', {
  id: id(),
  companyId: companyId(),
  requestId: uuid('request_id')
    .notNull()
    .references(() => procRequests.id),
  deliveryNote: text('delivery_note').notNull(),
  condition: text('condition').notNull(),
  docsOk: boolean('docs_ok').notNull().default(false),
  extra: jsonb('extra').notNull().default({}),
  /** Received quantity per line, in line order. */
  qty: jsonb('qty').$type<number[]>().notNull(),
  intoStock: boolean('into_stock').notNull().default(false),
  byId: uuid('by_id').references(() => memberships.id),
  createdAt: at(),
});

/** Timeline: every step, approval, rejection and inspection on a request. */
export const procEvents = pgTable(
  'proc_events',
  {
    id: id(),
    companyId: companyId(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => procRequests.id),
    kind: text('kind').$type<'log' | 'approval' | 'rejection' | 'inspection'>().notNull(),
    stage: text('stage'),
    levelId: text('level_id'),
    result: text('result'),
    text: text('text').notNull(),
    note: text('note'),
    byId: uuid('by_id').references(() => memberships.id),
    createdAt: at(),
  },
  (t) => [index('proc_events_request').on(t.companyId, t.requestId, t.createdAt)],
);

/** Supplier quotation documents (PDF, photos) attached to a quote. Stored in S3 under the company prefix. Migration 0016. */
export const procQuoteFiles = pgTable(
  'proc_quote_files',
  {
    id: id(),
    companyId: companyId(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => procRequests.id),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => procQuotes.id),
    s3Key: text('s3_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** False until the browser finished uploading. */
    uploaded: boolean('uploaded').notNull().default(false),
    byId: uuid('by_id').references(() => memberships.id),
    createdAt: at(),
  },
  (t) => [index('proc_quote_files_request').on(t.companyId, t.requestId)],
);

/** MTC / test certificates and delivery documents the store uploads at goods receipt (migration 0027). */
export const procReceiptFiles = pgTable(
  'proc_receipt_files',
  {
    id: id(),
    companyId: companyId(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => procRequests.id),
    s3Key: text('s3_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploaded: boolean('uploaded').notNull().default(false),
    byId: uuid('by_id').references(() => memberships.id),
    createdAt: at(),
  },
  (t) => [index('proc_receipt_files_request').on(t.companyId, t.requestId)],
);
