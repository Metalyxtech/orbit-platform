import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { completeSignIn } from '@orbit/core/next';

export async function GET(req: NextRequest) {
  const base = process.env.APP_BASE_URL ?? req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const jar = await cookies();
  const expected = jar.get('orbit_oauth_state')?.value;
  jar.delete('orbit_oauth_state');
  if (!code || !state || state !== expected) return NextResponse.redirect(`${base}/sign-in?error=state`);
  try {
    await completeSignIn(code);
  } catch (err) {
    console.error('sign-in failed', err);
    return NextResponse.redirect(`${base}/sign-in?error=auth`);
  }
  return NextResponse.redirect(`${base}/`);
}
