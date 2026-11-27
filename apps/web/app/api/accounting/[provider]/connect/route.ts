import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@orbit/core/next';
import { signState } from '@/accounting/crypto';
import { appKeys, CONNECTORS, isOnline } from '@/accounting/store';

export const dynamic = 'force-dynamic';

const PAGE = '/manage/company/accounting';

/** Company admin > Accounting > Connect: sends the admin to Zoho Books, QuickBooks or Xero to allow access. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const base = process.env.APP_BASE_URL ?? req.nextUrl.origin;
  const { provider } = await params;
  const s = await getSession();
  if (s.state !== 'ok' || s.ctx.role !== 'company_admin') return NextResponse.redirect(`${base}/manage`);
  if (!isOnline(provider)) return NextResponse.redirect(`${base}${PAGE}?error=unknown`);
  const keys = await appKeys(provider);
  if (!keys) return NextResponse.redirect(`${base}${PAGE}?error=not_set_up&provider=${provider}`);
  const nonce = randomBytes(16).toString('hex');
  const state = await signState({ c: s.ctx.companyId, m: s.ctx.membershipId, p: provider, n: nonce });
  (await cookies()).set('orbit_acct_oauth', nonce, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/accounting', maxAge: 900 });
  return NextResponse.redirect(CONNECTORS[provider].authorizeUrl(keys.clientId, state, `${base}/api/accounting/${provider}/callback`));
}
