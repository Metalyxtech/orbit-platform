import { and, eq, inArray } from 'drizzle-orm';
import type { AcctDocKind } from '@orbit/core/accounting';
import { findSecret } from '@orbit/core/aws';
import { acctConnections, acctSync, type Tx } from '@orbit/db';
import { decrypt, encrypt } from './crypto';
import { quickbooks } from './quickbooks';
import type { Conn, Keys, OnlineConnector, OnlineProvider, Org, Provider, Tokens } from './types';
import { xero } from './xero';
import { zoho } from './zoho';

// Connections and sync records in the company's own (RLS) tables. One accounts software is active
// per company: connecting another one switches to it (the old one is kept, inactive).

export const CONNECTORS: Record<OnlineProvider, OnlineConnector> = { zoho, quickbooks, xero };
export const PROVIDER_NAMES: Record<Provider, string> = { tally: 'Tally', zoho: 'Zoho Books', quickbooks: 'QuickBooks Online', xero: 'Xero' };
export const isProvider = (p: string): p is Provider => p in PROVIDER_NAMES;
export const isOnline = (p: string): p is OnlineProvider => p in CONNECTORS;

const KEY_NAMES = {
  zoho: ['zohoClientId', 'zohoClientSecret'],
  quickbooks: ['quickbooksClientId', 'quickbooksClientSecret'],
  xero: ['xeroClientId', 'xeroClientSecret'],
} as const;

/** SteelConnect360's app keys for a provider, or null when that provider is not set up yet. */
export async function appKeys(p: OnlineProvider): Promise<Keys | null> {
  const [clientId, clientSecret] = await Promise.all(KEY_NAMES[p].map((n) => findSecret(n)));
  const tokenKey = await findSecret('accountingTokenKey');
  return clientId && clientSecret && tokenKey ? { clientId, clientSecret } : null;
}

export type ConnectionRow = typeof acctConnections.$inferSelect;

export async function connections(tx: Tx, companyId: string) {
  return tx.select().from(acctConnections).where(eq(acctConnections.companyId, companyId));
}

export async function activeConnection(tx: Tx, companyId: string) {
  const [row] = await tx
    .select()
    .from(acctConnections)
    .where(and(eq(acctConnections.companyId, companyId), eq(acctConnections.active, true)));
  return row ?? null;
}

/** The active online connection with its tokens decrypted. */
export async function openConnection(row: ConnectionRow): Promise<Conn> {
  if (!isOnline(row.provider)) throw new Error('Not an online connection');
  return {
    id: row.id,
    provider: row.provider,
    orgId: row.orgId ?? '',
    orgName: row.orgName,
    apiBase: row.apiBase,
    settings: row.settings,
    accessToken: (await decrypt(row.accessToken)) ?? '',
    refreshToken: (await decrypt(row.refreshToken)) ?? '',
    expiresAt: row.expiresAt ?? new Date(0),
  };
}

/** Makes `provider` the company's one active accounts software. */
async function activate(tx: Tx, companyId: string, provider: Provider) {
  await tx.update(acctConnections).set({ active: false }).where(eq(acctConnections.companyId, companyId));
  await tx
    .update(acctConnections)
    .set({ active: true })
    .where(and(eq(acctConnections.companyId, companyId), eq(acctConnections.provider, provider)));
}

/** Saves a finished sign-in. Keeps the settings chosen before when reconnecting the same organisation. */
export async function saveOnline(tx: Tx, companyId: string, by: string, provider: OnlineProvider, tokens: Tokens, orgs: Org[]) {
  const [old] = await tx
    .select()
    .from(acctConnections)
    .where(and(eq(acctConnections.companyId, companyId), eq(acctConnections.provider, provider)));
  const org = orgs.find((o) => o.id === old?.orgId) ?? orgs[0];
  const keep = old && old.orgId === org.id ? old.settings : {};
  const values = {
    status: 'connected',
    orgId: org.id,
    orgName: org.name,
    apiBase: tokens.apiBase ?? null,
    accessToken: await encrypt(tokens.accessToken),
    refreshToken: await encrypt(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
    settings: { ...keep, orgs },
    lastError: null,
    connectedBy: by,
    connectedAt: new Date(),
  };
  if (old) await tx.update(acctConnections).set(values).where(eq(acctConnections.id, old.id));
  else await tx.insert(acctConnections).values({ companyId, provider, ...values });
  await activate(tx, companyId, provider);
  return org;
}

/** Tally needs no sign-in: saving its ledger names makes it the active accounts software. */
export async function saveTally(tx: Tx, companyId: string, by: string, settings: Record<string, unknown>) {
  const [old] = await tx
    .select()
    .from(acctConnections)
    .where(and(eq(acctConnections.companyId, companyId), eq(acctConnections.provider, 'tally')));
  if (old) await tx.update(acctConnections).set({ settings, status: 'connected', lastError: null }).where(eq(acctConnections.id, old.id));
  else await tx.insert(acctConnections).values({ companyId, provider: 'tally', settings, connectedBy: by, orgName: 'Tally (file import)' });
  await activate(tx, companyId, 'tally');
}

export async function saveTokens(tx: Tx, id: string, t: Tokens) {
  await tx
    .update(acctConnections)
    .set({ accessToken: await encrypt(t.accessToken), refreshToken: await encrypt(t.refreshToken), expiresAt: t.expiresAt, ...(t.apiBase !== undefined ? { apiBase: t.apiBase } : {}) })
    .where(eq(acctConnections.id, id));
}

export async function markError(tx: Tx, id: string, message: string) {
  await tx.update(acctConnections).set({ status: 'error', lastError: message }).where(eq(acctConnections.id, id));
}

/** What was sent where, for a set of documents (or all of one kind). */
export async function syncRows(tx: Tx, companyId: string, provider: Provider, kind?: AcctDocKind, ids?: string[]) {
  const where = [eq(acctSync.companyId, companyId), eq(acctSync.provider, provider)];
  if (kind) where.push(eq(acctSync.kind, kind));
  if (ids) where.push(inArray(acctSync.docId, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']));
  return tx
    .select()
    .from(acctSync)
    .where(and(...where));
}

export async function recordSync(
  tx: Tx,
  companyId: string,
  r: { provider: Provider; kind: AcctDocKind; docId: string; docNumber: string; status: 'sent' | 'failed' | 'exported'; externalId?: string | null; error?: string | null; byId?: string | null },
) {
  const values = { status: r.status, externalId: r.externalId ?? null, error: r.error ?? null, byId: r.byId ?? null, docNumber: r.docNumber, at: new Date() };
  const [old] = await syncRows(tx, companyId, r.provider, r.kind, [r.docId]);
  if (old) await tx.update(acctSync).set({ ...values, attempts: old.attempts + 1 }).where(eq(acctSync.id, old.id));
  else await tx.insert(acctSync).values({ companyId, provider: r.provider, kind: r.kind, docId: r.docId, ...values });
}
