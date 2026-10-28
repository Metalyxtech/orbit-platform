import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { authorizationUrl } from '@orbit/core/next';

export async function GET(req: NextRequest) {
  const state = randomBytes(16).toString('base64url');
  (await cookies()).set('orbit_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/auth', maxAge: 600 });
  const hint = req.nextUrl.searchParams.get('hint') === 'sign-up' ? 'sign-up' : 'sign-in';
  return NextResponse.redirect(await authorizationUrl(state, hint));
}
