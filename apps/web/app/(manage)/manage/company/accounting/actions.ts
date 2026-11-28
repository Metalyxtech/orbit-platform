'use server';
import { runAction, requireSession } from '@orbit/core/next';
import { disconnect, requireAdmin, resetDoc, saveOnlineSettings, saveTallySettings } from '@/accounting/admin';
import { sendDocs, type SendResult } from '@/accounting/send';

type In<F> = F extends (tx: never, ctx: never, input: infer I) => unknown ? I : never;

export async function saveOnlineSettingsAction(input: In<typeof saveOnlineSettings>) {
  return runAction((tx, ctx) => saveOnlineSettings(tx, ctx, input));
}
export async function saveTallySettingsAction(input: In<typeof saveTallySettings>) {
  return runAction((tx, ctx) => saveTallySettings(tx, ctx, input));
}
export async function disconnectAction(input: { provider: string }) {
  return runAction((tx, ctx) => disconnect(tx, ctx, input));
}
export async function resetDocAction(input: { kind: string; id: string }) {
  return runAction((tx, ctx) => resetDoc(tx, ctx, input));
}

/** Sends the chosen (or all not yet sent) invoices or bills to Zoho Books, QuickBooks or Xero. */
export async function sendDocsAction(input: { kind: 'sales_invoice' | 'purchase_bill'; ids: string[] | 'unsent' }): Promise<{ ok: true; data: SendResult } | { ok: false; error: string }> {
  try {
    const ctx = await requireSession();
    requireAdmin(ctx);
    if (input.kind !== 'sales_invoice' && input.kind !== 'purchase_bill') throw new Error('Unknown document type');
    const ids = input.ids === 'unsent' ? 'unsent' : input.ids.filter((x) => typeof x === 'string').slice(0, 100);
    return { ok: true, data: await sendDocs(ctx.companyId, input.kind, ids, ctx.membershipId) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not send. Try again.' };
  }
}
