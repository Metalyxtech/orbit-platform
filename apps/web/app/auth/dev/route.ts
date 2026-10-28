import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { DEV_COOKIE, devAuthEnabled } from '@orbit/core/next';

/** Local development only (APP_STAGE=local and APP_AUTH_MODE=dev). 404 everywhere else. */
export async function GET(req: NextRequest) {
  if (!devAuthEnabled()) return new NextResponse('Not found', { status: 404 });
  const email = req.nextUrl.searchParams.get('email') ?? '';
  (await cookies()).set(DEV_COOKIE, email.toLowerCase(), { httpOnly: true, sameSite: 'lax', path: '/' });
  return NextResponse.redirect(new URL('/', req.nextUrl.origin));
}
