import { NextResponse, type NextRequest } from 'next/server';
import { signOutUrl } from '@orbit/core/next';

/**
 * Sign-out is a same-origin POST, so another site cannot sign people out with a link or image.
 * Clear-Site-Data also drops the service worker cache and IndexedDB drafts, which matters on
 * shared site tablets: the next person cannot open the previous person's cached pages offline.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (origin && new URL(origin).host !== host) return new NextResponse('Forbidden', { status: 403 });
  const url = await signOutUrl();
  const res = NextResponse.redirect(url.startsWith('http') ? url : new URL(url, req.nextUrl.origin), 303);
  res.headers.set('Clear-Site-Data', '"cache", "storage"');
  return res;
}

/** Old links and bookmarks: go home without signing out. */
export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL('/', req.nextUrl.origin));
}
