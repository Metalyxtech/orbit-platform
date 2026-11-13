import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { presignDownload } from '@orbit/core/aws';
import { getSession, query } from '@orbit/core/next';
import { receipts } from '@orbit/portal-production/server';
import { accessiblePortals } from '@/portal-access';

export const dynamic = 'force-dynamic';

/** Opens an MTC / receipt document of the production store: Production, Quality (QC checks it) or Purchase. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const fileId = z.uuid().safeParse((await params).fileId);
  if (!fileId.success) return new NextResponse('Not found', { status: 404 });
  const s = await getSession();
  if (s.state !== 'ok') return new NextResponse('Not found', { status: 404 });
  const file = await query(async (tx, ctx) =>
    (await accessiblePortals(tx, ctx)).some((p) => p === 'production' || p === 'quality' || p === 'procurement') ? receipts.receiptFile(tx, ctx.companyId, fileId.data) : null,
  );
  if (!file) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(await presignDownload(file.s3Key, 300));
}
