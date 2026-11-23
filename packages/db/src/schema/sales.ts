import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';

// Sales portal. Every table carries company_id and is under RLS (migration 0019).
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const companyId = () => uuid('company_id').notNull().references(() => companies.id);
const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: 'number' });
const money = (name: string) => numeric(name, { precision: 16, scale: 2, mode: 'number' });
const at = (name = 'created_at') => timestamp(name, { withTimezone: true }).notNull().defaultNow();

/** Company configuration (approval limits, GST, terms, targets) and document counters. */
export const salesSettings = pgTable('sales_settings', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id),
  config: jsonb('config').notNull(),
  enqSeq: integer('enq_seq').notNull().default(1000),
  qtSeq: integer('qt_seq').notNull().default(0),
  soSeq: integer('so_seq').notNull().default(300),
  invSeq: integer('inv_seq').notNull().default(400),
  updatedAt: at('updated_at'),
});

export const salesCustomers = pgTable(
  'sales_customers',
  {
    id: id(),
    companyId: companyId(),
    name: text('name').notNull(),
    city: text('city'),
    gstin: text('gstin'),
    contact: text('contact'),
    phone: text('phone'),
    email: text('email'),
    creditLimit: money('credit_limit'),
    terms: text('terms'),
    createdAt: at(),
  },
  (t) => [uniqueIndex('sales_customers_name').on(t.companyId, t.name)],
);

/** An enquiry (project) from first contact to won or lost, with its quotation. */
export const salesEnquiries = pgTable(
  'sales_enquiries',
  {
    id: id(),
    companyId: companyId(),
    number: text('number').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => salesCustomers.id),
    title: text('title').notNull(),
    details: text('details'),
    source: text('source'),
    ownerId: uuid('owner_id').references(() => memberships.id),
    /** enquiry | costing | quoted | negotiation | won | lost */
    stage: text('stage').notNull().default('enquiry'),
    probability: integer('probability').notNull().default(30),
    followUp: date('follow_up'),
    discount: numeric('discount', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
    quoteNo: text('quote_no'),
    rev: integer('rev').notNull().default(0),
    /** draft | pending (sales manager) | pending_gm (GM, final) | approved | rejected | sent */
    quoteStatus: text('quote_status').notNull().default('draft'),
    lostReason: text('lost_reason'),
    /** Sent back in approval: to whom (exec | estimator | manager), why, and by which step (Sales manager | GM). Cleared when they act. */
    returnedTo: text('returned_to'),
    returnedNote: text('returned_note'),
    returnedBy: text('returned_by'),
    /** Estimator's markup on cost for the suggested selling rates (%). */
    markup: numeric('markup', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
    /** Estimator's basis: assumptions, inclusions and exclusions. */
    costingNotes: text('costing_notes'),
    /** The estimator finished pricing: the project details and documents are locked from then on. */
    pricingDoneAt: timestamp('pricing_done_at', { withTimezone: true }),
    createdAt: at(),
    updatedAt: at('updated_at'),
  },
  (t) => [uniqueIndex('sales_enquiries_number').on(t.companyId, t.number), index('sales_enquiries_stage').on(t.companyId, t.stage)],
);

/** Quotation lines: what is sold (rate) and what it costs (estimator). */
export const salesLines = pgTable(
  'sales_lines',
  {
    id: id(),
    companyId: companyId(),
    enquiryId: uuid('enquiry_id')
      .notNull()
      .references(() => salesEnquiries.id),
    position: integer('position').notNull(),
    item: text('item').notNull(),
    qty: qty('qty').notNull(),
    unit: text('unit').notNull(),
    rate: money('rate').notNull().default(0),
    /** Unit cost = material + labour + other (kept in step by the server). */
    cost: money('cost').notNull().default(0),
    material: money('material').notNull().default(0),
    labour: money('labour').notNull().default(0),
    other: money('other').notNull().default(0),
  },
  (t) => [index('sales_lines_enquiry').on(t.enquiryId, t.position)],
);

/** Timeline of everything that happened on an enquiry. */
export const salesEvents = pgTable(
  'sales_events',
  {
    id: id(),
    companyId: companyId(),
    enquiryId: uuid('enquiry_id')
      .notNull()
      .references(() => salesEnquiries.id),
    text: text('text').notNull(),
    byId: uuid('by_id').references(() => memberships.id),
    createdAt: at(),
  },
  (t) => [index('sales_events_enquiry').on(t.companyId, t.enquiryId, t.createdAt)],
);

/** Project documents for estimating: uploaded PDFs (S3) or links to large files elsewhere. */
export const salesDocs = pgTable(
  'sales_docs',
  {
    id: id(),
    companyId: companyId(),
    enquiryId: uuid('enquiry_id')
      .notNull()
      .references(() => salesEnquiries.id),
    /** file | link */
    kind: text('kind').notNull(),
    /** project (customer documents, sales uploads) | costing (estimator's sheets, supplier quotes) */
    section: text('section').notNull().default('project'),
    name: text('name').notNull(),
    url: text('url'),
    s3Key: text('s3_key'),
    contentType: text('content_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    uploaded: boolean('uploaded').notNull().default(false),
    byId: uuid('by_id').references(() => memberships.id),
    createdAt: at(),
  },
  (t) => [index('sales_docs_enquiry').on(t.companyId, t.enquiryId)],
);

/** Sales order: a won enquiry, confirmed by the manager, through production and dispatch. */
export const salesOrders = pgTable(
  'sales_orders',
  {
    id: id(),
    companyId: companyId(),
    number: text('number').notNull(),
    enquiryId: uuid('enquiry_id').references(() => salesEnquiries.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => salesCustomers.id),
    title: text('title').notNull(),
    value: money('value').notNull(),
    advancePct: integer('advance_pct').notNull().default(0),
    /** awaiting | confirmed | production | dispatched | invoiced */
    status: text('status').notNull().default('awaiting'),
    ownerId: uuid('owner_id').references(() => memberships.id),
    createdAt: at(),
  },
  (t) => [uniqueIndex('sales_orders_number').on(t.companyId, t.number)],
);

export const salesInvoices = pgTable(
  'sales_invoices',
  {
    id: id(),
    companyId: companyId(),
    number: text('number').notNull(),
    orderId: uuid('order_id').references(() => salesOrders.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => salesCustomers.id),
    amount: money('amount').notNull(),
    paid: money('paid').notNull().default(0),
    issued: date('issued').notNull(),
    due: date('due').notNull(),
    createdAt: at(),
  },
  (t) => [uniqueIndex('sales_invoices_number').on(t.companyId, t.number)],
);

export const salesPayments = pgTable('sales_payments', {
  id: id(),
  companyId: companyId(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => salesInvoices.id),
  amount: money('amount').notNull(),
  reference: text('reference'),
  byId: uuid('by_id').references(() => memberships.id),
  createdAt: at(),
});
