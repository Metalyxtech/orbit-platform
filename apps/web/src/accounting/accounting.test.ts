import { afterEach, describe, expect, it, vi } from 'vitest';
import { splitTax, type AcctDoc } from '@orbit/core/accounting';
import { isInterState } from './gst';
import { quickbooks } from './quickbooks';
import { taxLines, tallyMastersXml, tallySettings, tallyVouchersXml, TALLY_DEFAULTS } from './tally';
import type { Conn } from './types';
import { xero } from './xero';
import { zoho } from './zoho';

const sale: AcctDoc = {
  kind: 'sales_invoice',
  id: '11111111-1111-1111-1111-111111111111',
  number: 'INV-401',
  date: '2026-12-09',
  due: '2027-01-08',
  party: { name: 'Acme & Sons', gstin: '33AAACA1234A1Z5', email: 'ap@acme.example' },
  reference: 'SO-301',
  description: 'SO-301: Flanges',
  net: 10000,
  taxRate: 18,
  taxName: 'GST',
  tax: 1800,
  total: 11800,
  paid: 0,
};
const bill: AcctDoc = { ...sale, kind: 'purchase_bill', id: '22222222-2222-2222-2222-222222222222', number: 'SUP/88', reference: 'PO-77', party: { name: 'Steel Mart', gstin: '29AAACS9999B1Z1' } };

describe('tax split', () => {
  it('splits a total into value and tax that add up exactly', () => {
    expect(splitTax(11800, 18)).toEqual({ net: 10000, tax: 1800 });
    const odd = splitTax(1000, 18);
    expect(odd.net + odd.tax).toBeCloseTo(1000, 2);
  });

  it('uses IGST only between two different states', () => {
    expect(isInterState('33AAAAA0000A1Z5', '33BBBBB0000B1Z5')).toBe(false);
    expect(isInterState('33AAAAA0000A1Z5', '29BBBBB0000B1Z5')).toBe(true);
    expect(isInterState('33AAAAA0000A1Z5', null)).toBe(false);
  });
});

describe('Tally files', () => {
  const s = tallySettings({ companyGstin: '33AAAAA0000A1Z5', companyName: 'Hekur Pvt Ltd' });

  it('balances a sales voucher: customer debit equals sales + CGST + SGST credits', () => {
    const xml = tallyVouchersXml(s, [sale]);
    expect(xml).toContain('<VOUCHER VCHTYPE="Sales" ACTION="Create"');
    expect(xml).toContain('<DATE>20261209</DATE>');
    expect(xml).toContain('<LEDGERNAME>Acme &amp; Sons</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-11800.00</AMOUNT>');
    expect(xml).toContain('<LEDGERNAME>Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>10000.00</AMOUNT>');
    expect(xml).toContain('<LEDGERNAME>Output CGST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>900.00</AMOUNT>');
    expect(xml).toContain('<SVCURRENTCOMPANY>Hekur Pvt Ltd</SVCURRENTCOMPANY>');
    const amounts = [...xml.matchAll(/<ALLLEDGERENTRIES\.LIST><LEDGERNAME>[^<]*<\/LEDGERNAME><ISDEEMEDPOSITIVE>\w+<\/ISDEEMEDPOSITIVE><AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((m) => Number(m[1]));
    expect(amounts.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 2);
  });

  it('books an inter-state purchase as IGST input, with the supplier invoice number as reference', () => {
    expect(taxLines(s, bill)).toEqual([['Input IGST', 1800]]);
    const xml = tallyVouchersXml(s, [bill]);
    expect(xml).toContain('<VOUCHER VCHTYPE="Purchase"');
    expect(xml).toContain('<REFERENCE>SUP/88</REFERENCE>');
    expect(xml).toContain('<LEDGERNAME>Steel Mart</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>11800.00</AMOUNT>');
  });

  it('splits odd GST amounts so CGST + SGST equal the tax', () => {
    const lines = taxLines(s, { ...sale, tax: 180.01 });
    expect(lines[0][1] + lines[1][1]).toBeCloseTo(180.01, 2);
  });

  it('lists each customer and supplier ledger once, under the right group', () => {
    const xml = tallyMastersXml(TALLY_DEFAULTS, [sale, sale, bill]);
    expect(xml.match(/<LEDGER NAME=/g)).toHaveLength(2);
    expect(xml).toContain('<PARENT>Sundry Debtors</PARENT>');
    expect(xml).toContain('<PARENT>Sundry Creditors</PARENT>');
  });
});

describe('online connectors', () => {
  const conn = (provider: Conn['provider'], settings: Record<string, unknown>): Conn => ({
    id: 'c',
    provider,
    orgId: 'org1',
    orgName: 'Org',
    apiBase: provider === 'zoho' ? 'https://www.zohoapis.in|https://accounts.zoho.in' : null,
    accessToken: 'tok',
    refreshToken: 'ref',
    expiresAt: new Date(Date.now() + 3_600_000),
    settings,
  });
  const calls: { url: string; init?: RequestInit }[] = [];
  const reply = (...bodies: unknown[]) => {
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(bodies.shift() ?? {}), { status: 200 });
      }),
    );
  };
  afterEach(() => vi.unstubAllGlobals());

  it('Zoho Books: creates the customer, then the invoice with our number, GST and place of supply', async () => {
    reply({ taxes: [{ tax_id: 'gst18', tax_name: 'GST18', tax_percentage: 18 }] }, { contacts: [] }, { contact: { contact_id: 'cust1' } }, { invoice: { invoice_id: 'inv9' } });
    expect(await zoho.push(conn('zoho', {}), sale)).toBe('inv9');
    expect(calls[1].url).toContain('https://www.zohoapis.in/books/v3/contacts?organization_id=org1');
    const contact = JSON.parse(String(calls[2].init?.body));
    expect(contact).toMatchObject({ contact_name: 'Acme & Sons', contact_type: 'customer', gst_no: '33AAACA1234A1Z5', place_of_contact: 'TN' });
    expect(calls[3].url).toContain('ignore_auto_number_generation=true');
    const inv = JSON.parse(String(calls[3].init?.body));
    expect(inv).toMatchObject({ customer_id: 'cust1', invoice_number: 'INV-401', place_of_supply: 'TN', line_items: [{ rate: 10000, quantity: 1, tax_id: 'gst18' }] });
    expect((calls[3].init?.headers as Record<string, string>).Authorization).toBe('Zoho-oauthtoken tok');
  });

  it('Zoho Books: a bill needs the expense account chosen first', async () => {
    reply();
    await expect(zoho.push(conn('zoho', {}), bill)).rejects.toThrow('expense account');
    expect(calls).toHaveLength(0);
  });

  it('QuickBooks: finds the vendor and books the bill to the chosen expense account', async () => {
    reply({ QueryResponse: { Vendor: [{ Id: '56' }] } }, { Bill: { Id: '901' } });
    expect(await quickbooks.push(conn('quickbooks', { purchaseAccount: '78', purchaseTax: '5' }), bill)).toBe('901');
    expect(new URL(calls[0].url).searchParams.get('query')).toBe("select Id from Vendor where DisplayName = 'Steel Mart'");
    const body = JSON.parse(String(calls[1].init?.body));
    expect(body).toMatchObject({ VendorRef: { value: '56' }, DocNumber: 'SUP/88', GlobalTaxCalculation: 'TaxExcluded', Line: [{ Amount: 10000, AccountBasedExpenseLineDetail: { AccountRef: { value: '78' }, TaxCodeRef: { value: '5' } } }] });
  });

  it('QuickBooks: escapes quotes in names when searching', async () => {
    reply({ QueryResponse: { Customer: [{ Id: '1' }] } }, { Invoice: { Id: '2' } });
    await quickbooks.push(conn('quickbooks', { salesItem: '9' }), { ...sale, party: { name: "O'Neil Ltd" } });
    expect(new URL(calls[0].url).searchParams.get('query')).toContain("DisplayName = 'O\\'Neil Ltd'");
  });

  it('Xero: sends a draft sales invoice with tax exclusive amounts', async () => {
    reply({ Invoices: [{ InvoiceID: 'x1' }] });
    expect(await xero.push(conn('xero', { salesAccount: '200', salesTax: 'OUTPUT2' }), sale)).toBe('x1');
    const inv = JSON.parse(String(calls[0].init?.body)).Invoices[0];
    expect(inv).toMatchObject({ Type: 'ACCREC', Status: 'DRAFT', InvoiceNumber: 'INV-401', LineAmountTypes: 'Exclusive', LineItems: [{ UnitAmount: 10000, AccountCode: '200', TaxType: 'OUTPUT2' }] });
    expect((calls[0].init?.headers as Record<string, string>)['xero-tenant-id']).toBe('org1');
  });

  it('reports a lost sign-in as needing reconnection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(xero.push(conn('xero', { salesAccount: '200' }), sale)).rejects.toThrow('Reconnect Xero');
  });
});
