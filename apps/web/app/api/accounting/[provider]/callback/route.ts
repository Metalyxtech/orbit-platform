import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { audit } from '@orbit/core';
import { getSession, runAction } from '@orbit/core/next';
import { readState } from '@/accounting/crypto';
import { appKeys, CONNECTORS, isOnline, PROVIDER_NAMES, saveOnline } from '@/accounting/store';
import { ProviderError } from '@/accounting/types';

export const dynamic = 'force-dynamic';

const PAGE = '/manage/company/accounting';

/** The provider sends the admin back here after they allow (or refuse) access. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const base = process.env.APP_BASE_URL ?? req.nextUrl.origin;
  const back = (q: string) => NextResponse.redirect(`${base}${PAGE}?${q}`);
  const { provider } = await params;
  const q = req.nextUrl.searchParams;
  const jar = await cookies();
  const nonce = jar.get('orbit_acct_oauth')?.value;
  jar.delete('orbit_acct_oauth');
  if (!isOnline(provider)) return back('error=unknown');
  if (q.get('error')) return back(`error=refused&provider=${provider}`);
  const state = await readState(q.get('state')).catch(() => null);
  const s = await getSession();
  // The same browser, person and company that pressed Connect, within 15 minutes.
  if (!state || !nonce || state.n !== nonce || state.p !== provider || s.state !== 'ok' || s.ctx.companyId !== state.c || s.ctx.membershipId !== state.m || s.ctx.role !== 'company_admin') {
    return back('error=expired');
  }
  const keys = await appKeys(provider);
  if (!keys) return back(`error=not_set_up&provider=${provider}`);
  let got;
  try {
    got = await CONNECTORS[provider].exchange(keys, q, `${base}/api/accounting/${provider}/callback`);
  } catch (err) {
    console.error(JSON.stringify({ at: 'accounting.connect', provider, error: String(err) }));
    return back(`error=${err instanceof ProviderError ? 'provider' : 'failed'}&provider=${provider}`);
  }
  const res = await runAction(async (tx, ctx) => {
    const org = await saveOnline(tx, ctx.companyId, ctx.membershipId, provider, got.tokens, got.orgs);
    await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'accounting.connect', entity: 'acct_connections', data: { summary: [`${PROVIDER_NAMES[provider]} connected: ${org.name}`] }, requestId: ctx.requestId });
    return org;
  });
  return res.ok ? back(`connected=${provider}`) : back(`error=failed&provider=${provider}`);
}
