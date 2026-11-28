import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { accountingDocs, type AcctDocKind } from '@orbit/core/accounting';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { acctConnections, acctSync, companyPortals, type Tx } from '@orbit/db';
import { activeConnection, appKeys, connections, isOnline, PROVIDER_NAMES, saveTally, syncRows } from './store';
import { TALLY_DEFAULTS, tallySettings } from './tally';
import type { OnlineProvider, Provider } from './types';

// Company admin > Accounting: what the page shows and the changes it makes. Tokens never leave the
// server; the page only sees names, statuses and settings.

export const requireAdmin = (ctx: Pick<SessionContext, 'role'>) => {
  if (ctx.role !== 'company_admin') throw new Error('Only the company admin can manage the accounting connection');
};

const KINDS: { kind: AcctDocKind; portal: string; label: string }[] = [
  { kind: 'sales_invoice', portal: 'sales', label: 'Sales invoices' },
  { kind: 'purchase_bill', portal: 'procurement', label: 'Purchase bills' },
];

export async function accountingPage(tx: Tx, ctx: SessionContext) {
  requireAdmin(ctx);
  const [rows, active, portals] = await Promise.all([
    connections(tx, ctx.companyId),
    activeConnection(tx, ctx.companyId),
    tx.select({ portal: companyPortals.portal }).from(companyPortals).where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.enabled, true))),
  ]);
  const on = new Set(portals.map((p) => p.portal));
  const kinds = KINDS.filter((k) => on.has(k.portal));
  const lists = await Promise.all(
    kinds.map(async (k) => {
      const docs = await accountingDocs(tx, ctx.companyId, k.kind);
      const sync = active ? new Map((await syncRows(tx, ctx.companyId, active.provider, k.kind)).map((s) => [s.docId, s])) : new Map();
      return {
        ...k,
        docs: docs.map((d) => {
          const s = sync.get(d.id);
          return { id: d.id, number: d.number, date: d.date, party: d.party.name, reference: d.reference, net: d.net, tax: d.tax, total: d.total, status: (s?.status ?? 'new') as 'new' | 'sent' | 'failed' | 'exported', error: s?.error ?? null, at: s?.at ?? null };
        }),
      };
    }),
  );
  const configured = Object.fromEntries(await Promise.all((['zoho', 'quickbooks', 'xero'] as OnlineProvider[]).map(async (p) => [p, !!(await appKeys(p))]))) as Record<OnlineProvider, boolean>;
  return {
    active: active
      ? {
          provider: active.provider as Provider,
          name: PROVIDER_NAMES[active.provider as Provider],
          status: active.status,
          orgName: active.orgName,
          orgId: active.orgId,
          lastError: active.lastError,
          connectedAt: active.connectedAt,
          settings: active.provider === 'tally' ? { ...tallySettings(active.settings), ...pickCommon(active.settings) } : publicSettings(active.settings),
        }
      : null,
    others: rows.filter((r) => !r.active).map((r) => ({ provider: r.provider as Provider, name: PROVIDER_NAMES[r.provider as Provider], orgName: r.orgName })),
    configured,
    tallyDefaults: TALLY_DEFAULTS,
    lists,
  };
}
export type AccountingPage = Awaited<ReturnType<typeof accountingPage>>;

const pickCommon = (s: Record<string, unknown>) => ({ autoSend: s.autoSend === true, sendSales: s.sendSales !== false, sendPurchase: s.sendPurchase !== false });
/** Settings the page may show: choices, switches and the organisation list. */
const publicSettings = (s: Record<string, unknown>) => {
  const out: Record<string, unknown> = { ...pickCommon(s), approve: s.approve === true };
  for (const k of ['salesAccount', 'salesTax', 'salesItem', 'purchaseAccount', 'purchaseTax']) if (typeof s[k] === 'string') out[k] = s[k];
  if (Array.isArray(s.orgs)) out.orgs = s.orgs;
  return out;
};

const choice = z.string().trim().max(120).optional();
const onlineInput = z.object({
  autoSend: z.boolean(),
  sendSales: z.boolean(),
  sendPurchase: z.boolean(),
  approve: z.boolean().optional(),
  salesAccount: choice,
  salesTax: choice,
  salesItem: choice,
  purchaseAccount: choice,
  purchaseTax: choice,
  orgId: z.string().trim().max(80).optional(),
});

/** Accounts, taxes, switches and (when the login reaches several) the organisation. */
export async function saveOnlineSettings(tx: Tx, ctx: ActionContext, raw: z.input<typeof onlineInput>) {
  requireAdmin(ctx);
  const v = onlineInput.parse(raw);
  const row = await activeConnection(tx, ctx.companyId);
  if (!row || !isOnline(row.provider)) throw new Error('Connect Zoho Books, QuickBooks or Xero first');
  const orgs = (Array.isArray(row.settings.orgs) ? row.settings.orgs : []) as { id: string; name: string }[];
  const org = v.orgId && v.orgId !== row.orgId ? orgs.find((o) => o.id === v.orgId) : undefined;
  if (v.orgId && v.orgId !== row.orgId && !org) throw new Error('That organisation is not available to this login');
  const { orgId: _drop, ...rest } = v;
  // A different organisation has different accounts and taxes: start its choices afresh.
  const settings = org ? { orgs, autoSend: v.autoSend, sendSales: v.sendSales, sendPurchase: v.sendPurchase, approve: v.approve } : { ...row.settings, ...rest };
  await tx
    .update(acctConnections)
    .set({ settings, ...(org ? { orgId: org.id, orgName: org.name } : {}) })
    .where(eq(acctConnections.id, row.id));
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'accounting.settings', entity: 'acct_connections', entityId: row.id, data: { summary: [`${PROVIDER_NAMES[row.provider as Provider]} settings saved${org ? `: organisation ${org.name}` : ''}`, `Automatic sending ${v.autoSend ? 'on' : 'off'}`] }, requestId: ctx.requestId });
  return { ok: true as const };
}

const ledger = z.string().trim().min(1, 'Enter the ledger name').max(100);
const tallyInput = z.object({
  companyName: z.string().trim().max(100),
  salesVoucherType: ledger,
  purchaseVoucherType: ledger,
  salesLedger: ledger,
  purchaseLedger: ledger,
  gstMode: z.enum(['split', 'single']),
  companyGstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((g) => !g || /^[0-9]{2}[A-Z0-9]{13}$/.test(g), 'Enter a valid 15-character GSTIN'),
  outputCgst: ledger,
  outputSgst: ledger,
  outputIgst: ledger,
  inputCgst: ledger,
  inputSgst: ledger,
  inputIgst: ledger,
  outputTax: ledger,
  inputTax: ledger,
  debtorsGroup: ledger,
  creditorsGroup: ledger,
});

/** Tally ledger names. Saving them makes Tally the company's accounts software. */
export async function saveTallySettings(tx: Tx, ctx: ActionContext, raw: z.input<typeof tallyInput>) {
  requireAdmin(ctx);
  const v = tallyInput.parse(raw);
  if (v.gstMode === 'split' && !v.companyGstin) throw new Error('Enter your company GSTIN so SteelConnect360 can tell CGST + SGST from IGST');
  await saveTally(tx, ctx.companyId, ctx.membershipId, v);
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'accounting.tally', entity: 'acct_connections', data: { summary: ['Tally ledgers saved: Tally is the accounts software'] }, requestId: ctx.requestId });
  return { ok: true as const };
}

/** Forgets the sign-in (tokens deleted). What was already sent stays recorded. */
export async function disconnect(tx: Tx, ctx: ActionContext, raw: { provider: string }) {
  requireAdmin(ctx);
  const provider = z.enum(['tally', 'zoho', 'quickbooks', 'xero']).parse(raw.provider);
  await tx
    .update(acctConnections)
    .set({ active: false, accessToken: null, refreshToken: null, expiresAt: null, status: 'error', lastError: 'Disconnected' })
    .where(and(eq(acctConnections.companyId, ctx.companyId), eq(acctConnections.provider, provider)));
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'accounting.disconnect', entity: 'acct_connections', data: { summary: [`${PROVIDER_NAMES[provider]} disconnected`] }, requestId: ctx.requestId });
  return { ok: true as const };
}

/** Clears a failed or exported mark so the document can be sent or exported again. */
export async function resetDoc(tx: Tx, ctx: ActionContext, raw: { kind: string; id: string }) {
  requireAdmin(ctx);
  const kind = z.enum(['sales_invoice', 'purchase_bill']).parse(raw.kind);
  const id = z.uuid().parse(raw.id);
  const row = await activeConnection(tx, ctx.companyId);
  if (!row) return { ok: true as const };
  await tx.delete(acctSync).where(and(eq(acctSync.companyId, ctx.companyId), eq(acctSync.provider, row.provider), eq(acctSync.kind, kind), eq(acctSync.docId, id)));
  return { ok: true as const };
}
