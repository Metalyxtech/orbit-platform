import type { AcctDoc } from '@orbit/core/accounting';
import { GST_STATES, stateOf } from './gst';
import { call, ProviderError, str, type Conn, type OnlineConnector, type OptionField } from './types';

// Zoho Books (all data centres: India, US, EU, UK, Australia...). Sign-in starts at accounts.zoho.com,
// which sends the person to their own data centre; the callback says which accounts server issued
// the code, and the token says which API domain to call. Invoices and bills are created with our
// numbers, as drafts unless the company chose otherwise.

const WHO = 'Zoho Books';
const SCOPE = 'ZohoBooks.contacts.ALL,ZohoBooks.invoices.ALL,ZohoBooks.bills.ALL,ZohoBooks.settings.READ,ZohoBooks.accountants.READ';
const ZOHO_ACCOUNTS = /^https:\/\/accounts\.zoho\.[a-z.]{2,8}$/;

const pick = (b: unknown) => (b && typeof b === 'object' && 'message' in b ? String((b as { message: unknown }).message) : undefined);
// apiBase is stored as "<api domain>|<accounts server>": both are per data centre.
const apiOf = (conn: Pick<Conn, 'apiBase'>) => (conn.apiBase ?? '').split('|')[0] || 'https://www.zohoapis.com';
const accountsOf = (conn: Pick<Conn, 'apiBase'>) => (conn.apiBase ?? '').split('|')[1] || 'https://accounts.zoho.com';
const books = (conn: Pick<Conn, 'apiBase'>) => `${apiOf(conn)}/books/v3`;
const auth = (conn: Conn) => ({ Authorization: `Zoho-oauthtoken ${conn.accessToken}` });

type TokenRes = { access_token: string; refresh_token?: string; expires_in: number; api_domain?: string; error?: string };

async function token(accounts: string, params: Record<string, string>) {
  const res = await call<TokenRes>(WHO, `${accounts}/oauth/v2/token?${new URLSearchParams(params)}`, { method: 'POST' }, pick);
  if (res.error || !res.access_token) throw new ProviderError(`${WHO} did not accept the sign-in (${res.error ?? 'no token'}). Try connecting again.`);
  return res;
}

async function get<T>(conn: Conn, path: string, q: Record<string, string> = {}) {
  return call<T>(WHO, `${books(conn)}${path}?${new URLSearchParams({ organization_id: conn.orgId, ...q })}`, { headers: auth(conn) }, pick);
}
async function post<T>(conn: Conn, path: string, body: unknown, q: Record<string, string> = {}) {
  return call<T>(WHO, `${books(conn)}${path}?${new URLSearchParams({ organization_id: conn.orgId, ...q })}`, { method: 'POST', headers: { ...auth(conn), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, pick);
}

type Tax = { tax_id: string; tax_name: string; tax_percentage: number };
type Account = { account_id: string; account_name: string; account_type: string };

async function contactId(conn: Conn, doc: AcctDoc) {
  const type = doc.kind === 'sales_invoice' ? 'customer' : 'vendor';
  const found = await get<{ contacts: { contact_id: string; contact_name: string; contact_type: string }[] }>(conn, '/contacts', { contact_name: doc.party.name });
  const hit = found.contacts.find((c) => c.contact_name.toLowerCase() === doc.party.name.toLowerCase() && c.contact_type === type);
  if (hit) return hit.contact_id;
  const state = stateOf(doc.party.gstin);
  const created = await post<{ contact: { contact_id: string } }>(conn, '/contacts', {
    contact_name: doc.party.name,
    contact_type: type,
    ...(doc.party.gstin ? { gst_no: doc.party.gstin, gst_treatment: 'business_gst' } : {}),
    ...(state && GST_STATES[state] ? { place_of_contact: GST_STATES[state][0] } : {}),
    ...(doc.party.email ? { email: doc.party.email } : {}),
    ...(doc.party.phone ? { phone: doc.party.phone } : {}),
  });
  return created.contact.contact_id;
}

/** The chosen tax, or the company's tax with the same percentage. */
async function taxId(conn: Conn, doc: AcctDoc, chosen: string | undefined) {
  if (!doc.tax) return undefined;
  if (chosen) return chosen;
  const { taxes } = await get<{ taxes: Tax[] }>(conn, '/settings/taxes');
  const same = taxes.find((t) => Math.abs(t.tax_percentage - doc.taxRate) < 0.001);
  if (!same) throw new ProviderError(`${WHO} has no ${doc.taxRate}% tax. Add one in Zoho Books, or choose the tax on the Accounting page.`);
  return same.tax_id;
}

export const zoho: OnlineConnector = {
  id: 'zoho',
  name: WHO,
  authorizeUrl: (clientId, state, redirectUri) =>
    `https://accounts.zoho.com/oauth/v2/auth?${new URLSearchParams({ scope: SCOPE, client_id: clientId, response_type: 'code', access_type: 'offline', prompt: 'consent', redirect_uri: redirectUri, state })}`,

  async exchange(keys, params, redirectUri) {
    const accounts = params.get('accounts-server') ?? 'https://accounts.zoho.com';
    if (!ZOHO_ACCOUNTS.test(accounts)) throw new ProviderError(`${WHO} sent an unexpected sign-in address. Try connecting again.`);
    const t = await token(accounts, { grant_type: 'authorization_code', client_id: keys.clientId, client_secret: keys.clientSecret, redirect_uri: redirectUri, code: params.get('code') ?? '' });
    if (!t.refresh_token) throw new ProviderError(`${WHO} did not allow offline access. Try connecting again.`);
    const apiBase = t.api_domain ?? 'https://www.zohoapis.com';
    const tokens = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000), apiBase: `${apiBase}|${accounts}` };
    const res = await call<{ organizations: { organization_id: string; name: string; is_default_org: boolean }[] }>(WHO, `${apiBase}/books/v3/organizations`, { headers: { Authorization: `Zoho-oauthtoken ${t.access_token}` } }, pick);
    const orgs = [...res.organizations].sort((a, b) => Number(b.is_default_org) - Number(a.is_default_org)).map((o) => ({ id: o.organization_id, name: o.name }));
    return { tokens, orgs };
  },

  async refresh(keys, conn) {
    const t = await token(accountsOf(conn), { grant_type: 'refresh_token', client_id: keys.clientId, client_secret: keys.clientSecret, refresh_token: conn.refreshToken });
    return { accessToken: t.access_token, refreshToken: conn.refreshToken, expiresAt: new Date(Date.now() + t.expires_in * 1000), apiBase: conn.apiBase };
  },

  async options(conn) {
    const c = conn;
    const [{ taxes }, { chartofaccounts }] = await Promise.all([get<{ taxes: Tax[] }>(c, '/settings/taxes'), get<{ chartofaccounts: Account[] }>(c, '/chartofaccounts')]);
    const accounts = (types: string[]) => chartofaccounts.filter((a) => types.includes(a.account_type)).map((a) => ({ value: a.account_id, label: a.account_name }));
    const taxChoices = taxes.map((t) => ({ value: t.tax_id, label: `${t.tax_name} (${t.tax_percentage}%)` }));
    const fields: OptionField[] = [
      { key: 'salesAccount', label: 'Income account', help: 'Where sales are booked. Leave empty for Zoho Books’ default Sales account.', for: 'sales', required: false, choices: accounts(['income', 'other_income']) },
      { key: 'salesTax', label: 'Tax on sales', help: 'Leave empty to use the tax with the same percentage as the invoice.', for: 'sales', required: false, choices: taxChoices },
      { key: 'purchaseAccount', label: 'Expense account for bills', help: 'Where supplier bills are booked, for example Cost of Goods Sold or Raw Materials.', for: 'purchase', required: true, choices: accounts(['expense', 'cost_of_goods_sold', 'other_expense']) },
      { key: 'purchaseTax', label: 'Tax on purchases', help: 'Leave empty to use the tax with the same percentage as the bill.', for: 'purchase', required: false, choices: taxChoices },
    ];
    return fields;
  },

  async push(conn, doc) {
    const c = conn;
    const sale = doc.kind === 'sales_invoice';
    const s = conn.settings;
    // Settings first: nothing is created in Zoho Books for a send that cannot finish.
    const account = str(s, sale ? 'salesAccount' : 'purchaseAccount');
    if (!sale && !account) throw new ProviderError('Choose the expense account for bills on the Accounting page first.');
    const tax = await taxId(c, doc, str(s, sale ? 'salesTax' : 'purchaseTax'));
    const contact = await contactId(c, doc);
    const line = { name: doc.description.slice(0, 100), description: doc.description, rate: doc.net, quantity: 1, ...(tax ? { tax_id: tax } : {}), ...(account ? { account_id: account } : {}) };
    const state = stateOf(doc.party.gstin);
    const place = state && GST_STATES[state] ? { place_of_supply: GST_STATES[state][0] } : {};
    if (sale) {
      const res = await post<{ invoice: { invoice_id: string } }>(
        c,
        '/invoices',
        { customer_id: contact, invoice_number: doc.number, reference_number: doc.reference, date: doc.date, due_date: doc.due, is_inclusive_tax: false, line_items: [line], ...place },
        { ignore_auto_number_generation: 'true' },
      );
      return res.invoice.invoice_id;
    }
    const res = await post<{ bill: { bill_id: string } }>(c, '/bills', { vendor_id: contact, bill_number: doc.number, reference_number: doc.reference, date: doc.date, due_date: doc.due, is_inclusive_tax: false, line_items: [line], ...place });
    return res.bill.bill_id;
  },
};
