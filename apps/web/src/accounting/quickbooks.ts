import type { AcctDoc } from '@orbit/core/accounting';
import { call, ProviderError, str, type Conn, type OnlineConnector, type OptionField } from './types';

// QuickBooks Online (Intuit). One login = one company ("realm"), named in the callback. Access
// tokens last an hour; the refresh token rotates on every refresh, so the new one is always saved.
// APP_QUICKBOOKS_ENV=sandbox points at Intuit's sandbox companies while testing.

const WHO = 'QuickBooks';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const MINOR = '75';
const api = () => (process.env.APP_QUICKBOOKS_ENV === 'sandbox' ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com');

const pick = (b: unknown) => {
  const f = (b as { Fault?: { Error?: { Message?: string; Detail?: string }[] } } | null)?.Fault?.Error?.[0];
  return f ? [f.Message, f.Detail].filter(Boolean).join(': ') : (b as { error_description?: string } | null)?.error_description;
};
const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
const base = (conn: Conn) => `${api()}/v3/company/${conn.orgId}`;
const headers = (conn: Conn) => ({ Authorization: `Bearer ${conn.accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' });
const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

type TokenRes = { access_token: string; refresh_token: string; expires_in: number };

async function query<T>(conn: Conn, sql: string): Promise<T> {
  const res = await call<{ QueryResponse: T }>(WHO, `${base(conn)}/query?${new URLSearchParams({ query: sql, minorversion: MINOR })}`, { headers: headers(conn) }, pick);
  return res.QueryResponse;
}
async function create<T>(conn: Conn, entity: string, body: unknown): Promise<T> {
  return call<T>(WHO, `${base(conn)}/${entity}?minorversion=${MINOR}`, { method: 'POST', headers: headers(conn), body: JSON.stringify(body) }, pick);
}

async function partyRef(conn: Conn, doc: AcctDoc) {
  const entity = doc.kind === 'sales_invoice' ? 'Customer' : 'Vendor';
  const found = await query<Record<string, { Id: string }[] | undefined>>(conn, `select Id from ${entity} where DisplayName = '${q(doc.party.name)}'`);
  const hit = found[entity]?.[0];
  if (hit) return hit.Id;
  const made = await create<Record<string, { Id: string }>>(conn, entity.toLowerCase(), {
    DisplayName: doc.party.name.slice(0, 100),
    ...(doc.party.email ? { PrimaryEmailAddr: { Address: doc.party.email } } : {}),
    ...(doc.party.phone ? { PrimaryPhone: { FreeFormNumber: doc.party.phone } } : {}),
    ...(doc.party.gstin ? { GSTIN: doc.party.gstin, GSTRegistrationType: 'GST_REG_REG' } : {}),
  });
  return made[entity].Id;
}

export const quickbooks: OnlineConnector = {
  id: 'quickbooks',
  name: WHO,
  authorizeUrl: (clientId, state, redirectUri) =>
    `https://appcenter.intuit.com/connect/oauth2?${new URLSearchParams({ client_id: clientId, response_type: 'code', scope: 'com.intuit.quickbooks.accounting', redirect_uri: redirectUri, state })}`,

  async exchange(keys, params, redirectUri) {
    const realm = params.get('realmId');
    if (!realm) throw new ProviderError(`${WHO} did not say which company to connect. Try again and pick a company.`);
    const t = await call<TokenRes>(
      WHO,
      TOKEN_URL,
      { method: 'POST', headers: { Authorization: basic(keys.clientId, keys.clientSecret), Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: params.get('code') ?? '', redirect_uri: redirectUri }) },
      pick,
    );
    const tokens = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000), apiBase: null };
    const conn = { ...tokens, id: '', provider: 'quickbooks' as const, orgId: realm, orgName: null, settings: {} };
    const info = await call<{ CompanyInfo?: { CompanyName?: string } }>(WHO, `${base(conn)}/companyinfo/${realm}?minorversion=${MINOR}`, { headers: headers(conn) }, pick).catch(() => null);
    return { tokens, orgs: [{ id: realm, name: info?.CompanyInfo?.CompanyName ?? 'QuickBooks company' }] };
  },

  async refresh(keys, conn) {
    const t = await call<TokenRes>(
      WHO,
      TOKEN_URL,
      { method: 'POST', headers: { Authorization: basic(keys.clientId, keys.clientSecret), Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken }) },
      pick,
    );
    return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000), apiBase: null };
  },

  async options(conn) {
    const [items, accounts, codes] = await Promise.all([
      query<{ Item?: { Id: string; Name: string }[] }>(conn, "select Id, Name from Item where Type in ('Service', 'NonInventory') and Active = true maxresults 1000"),
      query<{ Account?: { Id: string; Name: string; AccountType: string }[] }>(conn, "select Id, Name, AccountType from Account where Active = true maxresults 1000"),
      query<{ TaxCode?: { Id: string; Name: string }[] }>(conn, 'select Id, Name from TaxCode where Active = true maxresults 1000'),
    ]);
    const taxChoices = (codes.TaxCode ?? []).map((t) => ({ value: t.Id, label: t.Name }));
    const expense = (accounts.Account ?? []).filter((a) => ['Expense', 'Cost of Goods Sold', 'Other Expense'].includes(a.AccountType)).map((a) => ({ value: a.Id, label: a.Name }));
    const fields: OptionField[] = [
      { key: 'salesItem', label: 'Product or service for invoices', help: 'QuickBooks books every invoice line against a product or service; its income account decides where sales go.', for: 'sales', required: true, choices: (items.Item ?? []).map((i) => ({ value: i.Id, label: i.Name })) },
      { key: 'salesTax', label: 'Tax code on sales', help: 'The GST, VAT or sales tax code for invoices. US companies using automated sales tax can leave this empty.', for: 'sales', required: false, choices: taxChoices },
      { key: 'purchaseAccount', label: 'Expense account for bills', help: 'Where supplier bills are booked, for example Cost of Goods Sold or Job Materials.', for: 'purchase', required: true, choices: expense },
      { key: 'purchaseTax', label: 'Tax code on purchases', help: 'The input tax code for bills.', for: 'purchase', required: false, choices: taxChoices },
    ];
    return fields;
  },

  async push(conn, doc) {
    const sale = doc.kind === 'sales_invoice';
    const s = conn.settings;
    const tax = str(s, sale ? 'salesTax' : 'purchaseTax');
    const taxRef = tax && doc.tax ? { TaxCodeRef: { value: tax } } : {};
    // Settings first: nothing is created in QuickBooks for a send that cannot finish.
    const item = str(s, 'salesItem');
    const account = str(s, 'purchaseAccount');
    if (sale && !item) throw new ProviderError('Choose the product or service for invoices on the Accounting page first.');
    if (!sale && !account) throw new ProviderError('Choose the expense account for bills on the Accounting page first.');
    const party = await partyRef(conn, doc);
    if (sale) {
      const res = await create<{ Invoice: { Id: string } }>(conn, 'invoice', {
        CustomerRef: { value: party },
        DocNumber: doc.number.slice(0, 21),
        TxnDate: doc.date,
        DueDate: doc.due,
        PrivateNote: `From SteelConnect360, ${doc.reference}`,
        GlobalTaxCalculation: 'TaxExcluded',
        Line: [{ Amount: doc.net, Description: doc.description, DetailType: 'SalesItemLineDetail', SalesItemLineDetail: { ItemRef: { value: item! }, Qty: 1, UnitPrice: doc.net, ...taxRef } }],
      });
      return res.Invoice.Id;
    }
    const res = await create<{ Bill: { Id: string } }>(conn, 'bill', {
      VendorRef: { value: party },
      DocNumber: doc.number.slice(0, 21),
      TxnDate: doc.date,
      DueDate: doc.due,
      PrivateNote: `From SteelConnect360, ${doc.reference}`,
      GlobalTaxCalculation: 'TaxExcluded',
      Line: [{ Amount: doc.net, Description: doc.description, DetailType: 'AccountBasedExpenseLineDetail', AccountBasedExpenseLineDetail: { AccountRef: { value: account! }, ...taxRef } }],
    });
    return res.Bill.Id;
  },
};
