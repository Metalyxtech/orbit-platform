import type { AcctDoc } from '@orbit/core/accounting';
import { isInterState } from './gst';

// Tally (TallyPrime / Tally.ERP 9) has no internet API: it reads XML files. We build two files that
// the accountant imports with Gateway of Tally > Import > Masters (customer and supplier ledgers),
// then Import > Transactions (vouchers). In Tally's XML a debit is a negative amount with
// ISDEEMEDPOSITIVE Yes; a credit is positive with ISDEEMEDPOSITIVE No.

export interface TallySettings {
  companyName: string;
  salesVoucherType: string;
  purchaseVoucherType: string;
  salesLedger: string;
  purchaseLedger: string;
  /** split: CGST + SGST within the state, IGST between states (India). single: one tax ledger. */
  gstMode: 'split' | 'single';
  companyGstin: string;
  outputCgst: string;
  outputSgst: string;
  outputIgst: string;
  inputCgst: string;
  inputSgst: string;
  inputIgst: string;
  outputTax: string;
  inputTax: string;
  debtorsGroup: string;
  creditorsGroup: string;
}

export const TALLY_DEFAULTS: TallySettings = {
  companyName: '',
  salesVoucherType: 'Sales',
  purchaseVoucherType: 'Purchase',
  salesLedger: 'Sales',
  purchaseLedger: 'Purchase',
  gstMode: 'split',
  companyGstin: '',
  outputCgst: 'Output CGST',
  outputSgst: 'Output SGST',
  outputIgst: 'Output IGST',
  inputCgst: 'Input CGST',
  inputSgst: 'Input SGST',
  inputIgst: 'Input IGST',
  outputTax: 'Output Tax',
  inputTax: 'Input Tax',
  debtorsGroup: 'Sundry Debtors',
  creditorsGroup: 'Sundry Creditors',
};

export const tallySettings = (s: Record<string, unknown> | undefined): TallySettings => {
  const out = { ...TALLY_DEFAULTS };
  for (const k of Object.keys(TALLY_DEFAULTS) as (keyof TallySettings)[]) {
    const v = s?.[k];
    if (typeof v === typeof TALLY_DEFAULTS[k] && (typeof v !== 'string' || v.trim())) (out as Record<string, unknown>)[k] = typeof v === 'string' ? v.trim() : v;
  }
  if (typeof s?.companyGstin === 'string') out.companyGstin = s.companyGstin.trim().toUpperCase();
  return out;
};

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const amt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const tallyDate = (d: string) => d.replace(/-/g, '');
const r2 = (n: number) => Math.round(n * 100) / 100;

function entry(ledger: string, debit: boolean, amount: number, bill?: string) {
  const value = debit ? -amount : amount;
  const alloc = bill ? `<BILLALLOCATIONS.LIST><NAME>${esc(bill)}</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>${amt(value)}</AMOUNT></BILLALLOCATIONS.LIST>` : '';
  return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${amt(value)}</AMOUNT>${alloc}</ALLLEDGERENTRIES.LIST>`;
}

/** Tax ledgers and amounts for one document (CGST/SGST halves add up to the tax exactly). */
export function taxLines(s: TallySettings, d: AcctDoc): [string, number][] {
  if (!d.tax) return [];
  const sale = d.kind === 'sales_invoice';
  if (s.gstMode === 'single') return [[sale ? s.outputTax : s.inputTax, d.tax]];
  if (isInterState(s.companyGstin, d.party.gstin)) return [[sale ? s.outputIgst : s.inputIgst, d.tax]];
  const half = r2(d.tax / 2);
  return [
    [sale ? s.outputCgst : s.inputCgst, half],
    [sale ? s.outputSgst : s.inputSgst, r2(d.tax - half)],
  ];
}

function voucher(s: TallySettings, d: AcctDoc) {
  const sale = d.kind === 'sales_invoice';
  const type = sale ? s.salesVoucherType : s.purchaseVoucherType;
  // Sales: customer debit = income credit + tax credit. Purchase: expense + tax debit = supplier credit.
  const lines = [entry(d.party.name, sale, d.total, d.number), entry(sale ? s.salesLedger : s.purchaseLedger, !sale, d.net), ...taxLines(s, d).map(([l, a]) => entry(l, !sale, a))];
  const supplierNo = sale ? '' : `<REFERENCE>${esc(d.number)}</REFERENCE><REFERENCEDATE>${tallyDate(d.date)}</REFERENCEDATE>`;
  return (
    `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${esc(type)}" ACTION="Create" OBJVIEW="Accounting Voucher View">` +
    `<DATE>${tallyDate(d.date)}</DATE><VOUCHERTYPENAME>${esc(type)}</VOUCHERTYPENAME>` +
    `<VOUCHERNUMBER>${esc(sale ? d.number : d.reference)}</VOUCHERNUMBER>${supplierNo}` +
    `<PARTYLEDGERNAME>${esc(d.party.name)}</PARTYLEDGERNAME>` +
    (d.party.gstin ? `<PARTYGSTIN>${esc(d.party.gstin)}</PARTYGSTIN>` : '') +
    `<NARRATION>${esc(`${d.description} (from SteelConnect360)`)}</NARRATION>` +
    `<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>${lines.join('')}</VOUCHER></TALLYMESSAGE>`
  );
}

function party(s: TallySettings, d: AcctDoc) {
  const group = d.kind === 'sales_invoice' ? s.debtorsGroup : s.creditorsGroup;
  return (
    `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(d.party.name)}" ACTION="Create">` +
    `<NAME.LIST><NAME>${esc(d.party.name)}</NAME></NAME.LIST><PARENT>${esc(group)}</PARENT><ISBILLWISEON>Yes</ISBILLWISEON>` +
    (d.party.gstin ? `<PARTYGSTIN>${esc(d.party.gstin)}</PARTYGSTIN><GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>` : '') +
    (d.party.email ? `<EMAIL>${esc(d.party.email)}</EMAIL>` : '') +
    `</LEDGER></TALLYMESSAGE>`
  );
}

/** Customer and supplier ledgers (once each), for Import > Masters. Import this file first. */
export function tallyMastersXml(s: TallySettings, docs: AcctDoc[]) {
  const seen = new Set<string>();
  const parties = docs.filter((d) => {
    const k = `${d.kind}:${d.party.name.toLowerCase()}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  return envelope(s, 'All Masters', parties.map((d) => party(s, d)).join(''));
}

/** Sales and purchase vouchers, for Import > Transactions. */
export function tallyVouchersXml(s: TallySettings, docs: AcctDoc[]) {
  return envelope(s, 'Vouchers', docs.map((d) => voucher(s, d)).join(''));
}

function envelope(s: TallySettings, report: string, body: string) {
  const company = s.companyName ? `<STATICVARIABLES><SVCURRENTCOMPANY>${esc(s.companyName)}</SVCURRENTCOMPANY></STATICVARIABLES>` : '';
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY>` +
    `<IMPORTDATA><REQUESTDESC><REPORTNAME>${report}</REPORTNAME>${company}</REQUESTDESC><REQUESTDATA>${body}</REQUESTDATA></IMPORTDATA>` +
    `</BODY></ENVELOPE>\n`
  );
}
