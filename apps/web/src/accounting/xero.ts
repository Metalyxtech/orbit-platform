import type { AcctDoc } from '@orbit/core/accounting';
import { call, ProviderError, str, type Conn, type OnlineConnector, type OptionField } from './types';

// Xero. One login can reach several organisations ("tenants"); the company picks one. Access tokens
// last 30 minutes and the refresh token rotates. Uses Xero's granular scopes (required for apps
// created from March 2026). Sales invoices are ACCREC, supplier bills ACCPAY; Xero matches the
// contact by name and creates it when new.

const WHO = 'Xero';
const SCOPE = 'openid profile email offline_access accounting.invoices accounting.contacts accounting.settings.read';
const TOKEN_URL = 'https://identity.xero.com/connect/token';
const API = 'https://api.xero.com/api.xro/2.0';

const pick = (b: unknown) => {
  const x = b as { Detail?: string; Message?: string; Elements?: { ValidationErrors?: { Message: string }[] }[]; error?: string } | null;
  return x?.Elements?.[0]?.ValidationErrors?.map((e) => e.Message).join('; ') || x?.Detail || x?.Message || x?.error;
};
const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
const headers = (conn: Pick<Conn, 'accessToken' | 'orgId'>) => ({ Authorization: `Bearer ${conn.accessToken}`, 'xero-tenant-id': conn.orgId, Accept: 'application/json', 'Content-Type': 'application/json' });

type TokenRes = { access_token: string; refresh_token: string; expires_in: number };

async function token(keys: { clientId: string; clientSecret: string }, body: Record<string, string>) {
  return call<TokenRes>(WHO, TOKEN_URL, { method: 'POST', headers: { Authorization: basic(keys.clientId, keys.clientSecret), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) }, pick);
}

export const xero: OnlineConnector = {
  id: 'xero',
  name: WHO,
  authorizeUrl: (clientId, state, redirectUri) => `https://login.xero.com/identity/connect/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: SCOPE, state })}`,

  async exchange(keys, params, redirectUri) {
    const t = await token(keys, { grant_type: 'authorization_code', code: params.get('code') ?? '', redirect_uri: redirectUri });
    const tokens = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000), apiBase: null };
    const tenants = await call<{ tenantId: string; tenantName: string; tenantType: string }[]>(WHO, 'https://api.xero.com/connections', { headers: { Authorization: `Bearer ${t.access_token}` } }, pick);
    const orgs = tenants.filter((x) => x.tenantType === 'ORGANISATION').map((x) => ({ id: x.tenantId, name: x.tenantName }));
    if (!orgs.length) throw new ProviderError(`${WHO} did not give access to any organisation. Try again and tick your organisation.`);
    return { tokens, orgs };
  },

  async refresh(keys, conn) {
    const t = await token(keys, { grant_type: 'refresh_token', refresh_token: conn.refreshToken });
    return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000), apiBase: null };
  },

  async options(conn) {
    const [{ Accounts }, { TaxRates }] = await Promise.all([
      call<{ Accounts: { Code?: string; Name: string; Type: string; Status: string }[] }>(WHO, `${API}/Accounts`, { headers: headers(conn) }, pick),
      call<{ TaxRates: { TaxType: string; Name: string; EffectiveRate: number; Status: string; CanApplyToRevenue: boolean; CanApplyToExpenses: boolean }[] }>(WHO, `${API}/TaxRates`, { headers: headers(conn) }, pick),
    ]);
    const live = Accounts.filter((a) => a.Status === 'ACTIVE' && a.Code);
    const acc = (types: string[]) => live.filter((a) => types.includes(a.Type)).map((a) => ({ value: a.Code!, label: `${a.Code} ${a.Name}` }));
    const tax = (f: (t: (typeof TaxRates)[number]) => boolean) => TaxRates.filter((t) => t.Status === 'ACTIVE' && f(t)).map((t) => ({ value: t.TaxType, label: `${t.Name} (${t.EffectiveRate}%)` }));
    const fields: OptionField[] = [
      { key: 'salesAccount', label: 'Sales account', help: 'Where sales invoices are booked, for example 200 Sales.', for: 'sales', required: true, choices: acc(['REVENUE', 'SALES', 'OTHERINCOME']) },
      { key: 'salesTax', label: 'Tax rate on sales', help: 'The VAT, GST or sales tax rate for invoices.', for: 'sales', required: false, choices: tax((t) => t.CanApplyToRevenue) },
      { key: 'purchaseAccount', label: 'Purchases account', help: 'Where supplier bills are booked, for example 310 Cost of Goods Sold.', for: 'purchase', required: true, choices: acc(['DIRECTCOSTS', 'EXPENSE', 'OVERHEADS']) },
      { key: 'purchaseTax', label: 'Tax rate on purchases', help: 'The input tax rate for bills.', for: 'purchase', required: false, choices: tax((t) => t.CanApplyToExpenses) },
    ];
    return fields;
  },

  async push(conn, doc: AcctDoc) {
    const sale = doc.kind === 'sales_invoice';
    const s = conn.settings;
    const account = str(s, sale ? 'salesAccount' : 'purchaseAccount');
    if (!account) throw new ProviderError(`Choose the ${sale ? 'sales' : 'purchases'} account on the Accounting page first.`);
    const tax = str(s, sale ? 'salesTax' : 'purchaseTax');
    const body = {
      Invoices: [
        {
          Type: sale ? 'ACCREC' : 'ACCPAY',
          Contact: { Name: doc.party.name, ...(doc.party.email ? { EmailAddress: doc.party.email } : {}) },
          InvoiceNumber: doc.number,
          Reference: doc.reference,
          Date: doc.date,
          DueDate: doc.due,
          LineAmountTypes: 'Exclusive',
          Status: s.approve === true ? 'AUTHORISED' : 'DRAFT',
          LineItems: [{ Description: doc.description, Quantity: 1, UnitAmount: doc.net, AccountCode: account, ...(tax && doc.tax ? { TaxType: tax } : {}) }],
        },
      ],
    };
    const res = await call<{ Invoices: { InvoiceID: string; HasErrors?: boolean; ValidationErrors?: { Message: string }[] }[] }>(
      WHO,
      `${API}/Invoices?summarizeErrors=false`,
      { method: 'POST', headers: headers(conn), body: JSON.stringify(body) },
      pick,
    );
    const inv = res.Invoices[0];
    if (inv?.HasErrors) throw new ProviderError(`${WHO} refused it: ${inv.ValidationErrors?.map((e) => e.Message).join('; ')}`);
    return inv.InvoiceID;
  },
};
