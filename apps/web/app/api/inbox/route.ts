import { NextResponse } from 'next/server';
import { getSession, query } from '@orbit/core/next';
import { inboxItems } from '@/inbox';

export const dynamic = 'force-dynamic';

/** What is waiting for the signed-in person, for the notification pop-up. */
export async function GET() {
  const s = await getSession();
  if (s.state !== 'ok') return NextResponse.json({ items: [] }, { status: 401 });
  const items = await query((tx, ctx) => inboxItems(tx, ctx));
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
}
