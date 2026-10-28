import { NextResponse, type NextRequest } from 'next/server';
import { signOutUrl } from '@orbit/core/next';

export async function GET(req: NextRequest) {
  const url = await signOutUrl();
  return NextResponse.redirect(url.startsWith('http') ? url : new URL(url, req.nextUrl.origin));
}
