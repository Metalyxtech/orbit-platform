import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { presignDownload } from '@orbit/core/aws';
import { query } from '@orbit/core/next';
import { exports as exportsTable } from '@orbit/db';

export const dynamic = 'force-dynamic';

/** Export download link from the email: signed-in requester only, valid 24 hours. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await query(async (tx, ctx) => {
    const [r] = await tx.select().from(exportsTable).where(eq(exportsTable.id, id));
    return r && r.requestedBy === ctx.membershipId ? r : null;
  });
  if (!row || row.status !== 'ready' || !row.s3Key) return new NextResponse('Export not found', { status: 404 });
  if (Date.now() - row.createdAt.getTime() > 24 * 3_600_000) return new NextResponse('This link has expired', { status: 410 });
  return NextResponse.redirect(await presignDownload(row.s3Key, 300));
}
