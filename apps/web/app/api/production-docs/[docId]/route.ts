import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { presignDownload } from '@orbit/core/aws';
import { getSession, query } from '@orbit/core/next';
import { drawingFile } from '@orbit/portal-production/server';
import { accessiblePortals } from '@/portal-access';

export const dynamic = 'force-dynamic';

/** Opens a workshop drawing on a work order: anyone in the company with the Production portal. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const docId = z.uuid().safeParse((await params).docId);
  if (!docId.success) return new NextResponse('Not found', { status: 404 });
  const s = await getSession();
  if (s.state !== 'ok') return new NextResponse('Not found', { status: 404 });
  const file = await query(async (tx, ctx) => ((await accessiblePortals(tx, ctx)).includes('production') ? drawingFile(tx, ctx.companyId, docId.data) : null));
  if (!file?.s3Key) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(await presignDownload(file.s3Key, 300));
}
