import type { Tx } from '@orbit/db';
import type { ActionContext } from './session';

// The contract between the portals that make money documents (Sales invoices, Purchase bills) and
// the app's accounting connections (Zoho Books, QuickBooks, Xero, Tally). Each portal serves its
// documents in one plain shape and says when a new one is ready; the app (accounting/bridge.ts)
// sends them on. No portal knows which accounts software a company uses.

export type AcctDocKind = 'sales_invoice' | 'purchase_bill';

export interface AcctParty {
  name: string;
  gstin?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
}

/** One invoice or bill, one line: the value before tax, the tax and the total. */
export interface AcctDoc {
  kind: AcctDocKind;
  id: string;
  /** Our invoice number (sales) or the supplier's invoice number (purchase). */
  number: string;
  date: string;
  due: string;
  party: AcctParty;
  /** Sales order or purchase order number. */
  reference: string;
  description: string;
  net: number;
  taxRate: number;
  taxName: string;
  tax: number;
  total: number;
  /** Already received or paid (sales: advance and payments). */
  paid: number;
}

export interface AcctDocFilter {
  from?: string;
  to?: string;
  ids?: string[];
}

type Source = (tx: Tx, companyId: string, filter: AcctDocFilter) => Promise<AcctDoc[]>;
type ReadyHandler = (companyId: string, kind: AcctDocKind, id: string) => Promise<void>;

const KEY = Symbol.for('orbit.accounting');
const box = ((globalThis as Record<symbol, unknown>)[KEY] ??= { sources: {}, ready: undefined }) as { sources: Partial<Record<AcctDocKind, Source>>; ready?: ReadyHandler };

/** A portal serves its documents (registered by the app). */
export function serveAccountingDocs(kind: AcctDocKind, source: Source) {
  box.sources[kind] = source;
}

/** Documents of one kind, newest first. Empty when that portal is not installed. */
export async function accountingDocs(tx: Tx, companyId: string, kind: AcctDocKind, filter: AcctDocFilter = {}) {
  const source = box.sources[kind];
  return source ? source(tx, companyId, filter) : [];
}

/** The app's handler for new documents (sends them when the company chose automatic sending). */
export function onAccountingReady(handler: ReadyHandler) {
  box.ready = handler;
}

/** A portal says a document is ready to send. Runs after the transaction commits; never blocks it. */
export function accountingReady(ctx: ActionContext, kind: AcctDocKind, id: string) {
  const handler = box.ready;
  if (handler) ctx.effects.after.push(() => handler(ctx.companyId, kind, id));
}

/** Split a total that includes tax at `rate`% into value and tax that add up exactly. */
export function splitTax(total: number, rate: number) {
  const net = Math.round((total / (1 + (rate || 0) / 100)) * 100) / 100;
  return { net, tax: Math.round((total - net) * 100) / 100 };
}
