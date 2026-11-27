import { accountingDocs, type AcctDoc, type AcctDocKind } from '@orbit/core/accounting';
import { runAsSystem } from '@orbit/core/next';
import { activeConnection, appKeys, CONNECTORS, isOnline, markError, openConnection, PROVIDER_NAMES, recordSync, saveTokens, syncRows } from './store';
import { ProviderError, type Conn } from './types';

// Sending invoices and bills to the company's online accounts software. Each step that touches our
// database runs in its own short transaction; calls to Zoho, QuickBooks or Xero happen between
// them, never while a database transaction is open.

const MAX_PER_RUN = 25;
const run = <T>(companyId: string, fn: Parameters<typeof runAsSystem<T>>[2]) => runAsSystem(companyId, crypto.randomUUID(), fn);

export type SendResult = { sent: number; failed: number; skipped: number; errors: string[] };

/** Fresh tokens (refreshed a minute before they run out). Marks the connection when sign-in is lost. */
async function ready(companyId: string, conn: Conn): Promise<Conn> {
  if (conn.expiresAt.getTime() - Date.now() > 60_000) return conn;
  const keys = await appKeys(conn.provider);
  if (!keys) throw new ProviderError(`${PROVIDER_NAMES[conn.provider]} is not set up on SteelConnect360 yet.`);
  try {
    const t = await CONNECTORS[conn.provider].refresh(keys, conn);
    await run(companyId, (tx) => saveTokens(tx, conn.id, t));
    return { ...conn, ...t, apiBase: t.apiBase ?? conn.apiBase };
  } catch (err) {
    const msg = `${PROVIDER_NAMES[conn.provider]} sign-in has expired. Reconnect it on the Accounting page.`;
    await run(companyId, (tx) => markError(tx, conn.id, msg));
    throw new ProviderError(err instanceof ProviderError && !err.reconnect ? err.message : msg, true);
  }
}

/**
 * Sends documents to the active online accounts software. Already sent documents are skipped, so
 * pressing Send twice never makes duplicates.
 */
export async function sendDocs(companyId: string, kind: AcctDocKind, ids: string[] | 'unsent', byId: string | null): Promise<SendResult> {
  const loaded = await run(companyId, async (tx) => {
    const row = await activeConnection(tx, companyId);
    if (!row || !isOnline(row.provider)) return null;
    const docs = await accountingDocs(tx, companyId, kind, ids === 'unsent' ? {} : { ids });
    const done = new Set((await syncRows(tx, companyId, row.provider, kind, docs.map((d) => d.id))).filter((s) => s.status === 'sent').map((s) => s.docId));
    return { row, todo: docs.filter((d) => !done.has(d.id)), skipped: docs.filter((d) => done.has(d.id)).length };
  });
  if (!loaded) throw new Error('Connect Zoho Books, QuickBooks or Xero first. Tally uses the download instead.');
  const { row, todo, skipped } = loaded;
  const provider = row.provider as keyof typeof CONNECTORS;
  const result: SendResult = { sent: 0, failed: 0, skipped, errors: [] };
  let conn = await openConnection(row);
  for (const doc of todo.slice(0, MAX_PER_RUN).reverse()) {
    let externalId: string | null = null;
    let error: string | null = null;
    try {
      conn = await ready(companyId, conn);
      externalId = await CONNECTORS[provider].push(conn, doc);
    } catch (err) {
      error = err instanceof ProviderError ? err.message : 'Something went wrong while sending. Try again.';
      if (!(err instanceof ProviderError)) console.error(JSON.stringify({ at: 'accounting.send', provider, kind, error: String(err) }));
    }
    await run(companyId, (tx) => recordSync(tx, companyId, { provider, kind, docId: doc.id, docNumber: doc.number, status: error ? 'failed' : 'sent', externalId, error, byId }));
    if (error) {
      result.failed++;
      result.errors.push(`${doc.number}: ${error}`);
      // A lost sign-in fails every document the same way: stop and say it once.
      if (error.includes('Reconnect')) break;
    } else result.sent++;
  }
  return result;
}

/** A new invoice or bill: sent straight away when the company turned on automatic sending. */
export async function sendIfAutomatic(companyId: string, kind: AcctDocKind, id: string) {
  const row = await run(companyId, (tx) => activeConnection(tx, companyId));
  if (!row || !isOnline(row.provider) || row.status !== 'connected' || row.settings.autoSend !== true) return;
  if (row.settings[kind === 'sales_invoice' ? 'sendSales' : 'sendPurchase'] === false) return;
  await sendDocs(companyId, kind, [id], null);
}

export type { AcctDoc };

/** The dropdowns for the Accounting page, read live from the company's accounts software. */
export async function loadOptions(companyId: string): Promise<{ fields: import('./types').OptionField[]; error: string | null }> {
  const row = await run(companyId, (tx) => activeConnection(tx, companyId));
  if (!row || !isOnline(row.provider) || row.status !== 'connected') return { fields: [], error: null };
  try {
    const conn = await ready(companyId, await openConnection(row));
    return { fields: await CONNECTORS[conn.provider].options(conn), error: null };
  } catch (err) {
    return { fields: [], error: err instanceof ProviderError ? err.message : `Could not read your ${PROVIDER_NAMES[row.provider]} accounts. Try again.` };
  }
}
