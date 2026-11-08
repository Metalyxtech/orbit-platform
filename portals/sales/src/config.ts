// Sales portal: roles, stages, settings and quotation maths. Pure data and functions,
// safe to import from client components.

export type SalesRole = 'exec' | 'estimator' | 'manager' | 'gm' | 'accounts' | 'admin';

export const SALES_ROLES: { id: SalesRole; label: string; detail: string }[] = [
  { id: 'exec', label: 'Sales executive', detail: 'Enquiries, project documents, quotations, follow-ups, won and lost' },
  { id: 'estimator', label: 'Estimator', detail: 'Costs each enquiry from the project documents' },
  { id: 'manager', label: 'Sales manager', detail: 'Approves discounts, confirms orders, sets targets' },
  { id: 'gm', label: 'General manager', detail: 'Big discounts and low margins; company-wide view' },
  { id: 'accounts', label: 'Accounts', detail: 'GST invoices, payments received and overdue amounts' },
  { id: 'admin', label: 'Sales admin', detail: 'Everything, plus sales settings' },
];
export const roleLabel = (r: string) => SALES_ROLES.find((x) => x.id === r)?.label ?? r;

export type Stage = 'enquiry' | 'costing' | 'quoted' | 'negotiation' | 'won' | 'lost';
export const STAGES: { id: Stage; label: string }[] = [
  { id: 'enquiry', label: 'Enquiry' },
  { id: 'costing', label: 'Costing' },
  { id: 'quoted', label: 'Quotation' },
  { id: 'negotiation', label: 'Negotiation' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
];
export const OPEN_STAGES: Stage[] = ['enquiry', 'costing', 'quoted', 'negotiation'];
export const stageLabel = (s: string) => STAGES.find((x) => x.id === s)?.label ?? s;
export const stageTone = (s: string): 'steel' | 'warn' | 'hivis' | 'ok' | 'bad' | 'grey' =>
  (({ enquiry: 'grey', costing: 'warn', quoted: 'steel', negotiation: 'hivis', won: 'ok', lost: 'bad' }) as const)[s as Stage] ?? 'grey';

export type QuoteStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'sent';
export const QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: 'grey' | 'hivis' | 'ok' | 'bad' | 'steel' }> = {
  draft: { label: 'Draft', tone: 'grey' },
  pending: { label: 'Waiting approval', tone: 'hivis' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Sent back', tone: 'bad' },
  sent: { label: 'Sent to customer', tone: 'steel' },
};

export type OrderStatus = 'awaiting' | 'confirmed' | 'production' | 'dispatched' | 'invoiced';
export const ORDER_FLOW: { id: OrderStatus; label: string }[] = [
  { id: 'awaiting', label: 'Awaiting confirmation' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'production', label: 'In production' },
  { id: 'dispatched', label: 'Dispatched' },
  { id: 'invoiced', label: 'Invoiced' },
];
export const orderLabel = (s: string) => ORDER_FLOW.find((x) => x.id === s)?.label ?? s;

export const SOURCES = ['Phone', 'Website', 'Referral', 'Tender', 'Existing customer', 'Email', 'Walk-in'];
export const UNITS = ['MT', 'kg', 'm²', 'm', 'nos', 'lot', 'set'];
export const LOST_REASONS = ['Price: competitor lower', 'Delivery time', 'Project cancelled', 'No response from customer', 'Specification not met', 'Other'];

/**
 * Documents on an enquiry, in two sections of up to 10 each: the customer's project documents
 * (sales) and the estimator's costing attachments. PDFs up to 100 MB, photos and scans up to
 * 20 MB, or links for anything bigger (drawings over 2 GB, models).
 */
export const DOCS = {
  maxFiles: 10,
  maxPdfBytes: 100 * 1024 * 1024,
  maxImageBytes: 20 * 1024 * 1024,
  types: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  accept: 'application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp',
};
export type DocSection = 'project' | 'costing';
/** Size limit for one file of this type (0 = type not allowed). */
export const docLimit = (type: string) => (type === 'application/pdf' ? DOCS.maxPdfBytes : DOCS.types.includes(type) ? DOCS.maxImageBytes : 0);

export interface SalesConfig {
  /** The sales manager approves discounts up to this %; above it goes to the GM. */
  managerDiscount: number;
  /** A margin under this % always needs the GM. */
  minMargin: number;
  gst: number;
  currency: string;
  validityDays: number;
  paymentTermsDays: number;
  defaultAdvance: number;
  terms: string;
  /** Monthly order target per salesperson (membership id). */
  targets: Record<string, number>;
}
export const DEFAULT_CONFIG: SalesConfig = {
  managerDiscount: 10,
  minMargin: 12,
  gst: 18,
  currency: '₹',
  validityDays: 15,
  paymentTermsDays: 30,
  defaultAdvance: 30,
  terms: 'GST extra as applicable. Advance with order, balance against dispatch documents. Delivery as per approved drawings.',
  targets: {},
};

/** Unit cost of a line from its breakdown. */
export const unitCost = (l: { material: number; labour: number; other: number }) => (l.material || 0) + (l.labour || 0) + (l.other || 0);
/** Selling rate the estimator suggests: unit cost plus markup, rounded to the rupee. */
export const suggestedRate = (cost: number, markup: number) => Math.round(cost * (1 + (markup || 0) / 100));

export interface QuoteLine {
  qty: number;
  rate: number;
  cost: number;
}
/** Totals of a quotation: gross, discount, net (before GST), cost, margin %, GST and total. */
export function quoteTotals(lines: QuoteLine[], discount: number, gst: number) {
  const gross = lines.reduce((n, l) => n + l.qty * l.rate, 0);
  const disc = (gross * (discount || 0)) / 100;
  const net = gross - disc;
  const cost = lines.reduce((n, l) => n + l.qty * l.cost, 0);
  const margin = net > 0 ? ((net - cost) / net) * 100 : 0;
  const tax = (net * gst) / 100;
  return { gross, disc, net, cost, margin, tax, total: net + tax };
}

/** Who must approve a quotation before it goes out: nobody, the sales manager or the GM. */
export function approverFor(discount: number, margin: number, hasCost: boolean, cfg: Pick<SalesConfig, 'managerDiscount' | 'minMargin'>): null | 'manager' | 'gm' {
  if (discount > cfg.managerDiscount || (hasCost && margin < cfg.minMargin)) return 'gm';
  if (discount > 0) return 'manager';
  return null;
}

/** Indian money: ₹12,34,567 and short forms ₹12.3 L / ₹1.25 Cr. */
export const fmtMoney = (cur: string, v: number) => `${cur}${Math.round(v || 0).toLocaleString('en-IN')}`;
export const fmtShort = (cur: string, v: number) =>
  !v ? `${cur}0` : Math.abs(v) >= 1e7 ? `${cur}${(v / 1e7).toFixed(2)} Cr` : Math.abs(v) >= 1e5 ? `${cur}${(v / 1e5).toFixed(1)} L` : fmtMoney(cur, v);
export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(typeof d === 'string' && d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-';
export const fmtBytes = (n: number | null | undefined) => (!n ? '' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
