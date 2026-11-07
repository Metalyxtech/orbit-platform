import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { presignDownload } from '@orbit/core/aws';
import { getSession, query } from '@orbit/core/next';
import { quoteFiles } from '@orbit/portal-procurement/server';
import { accessiblePortals } from '@/portal-access';

export const dynamic = 'force-dynamic';

/** Opens a supplier quotation attached to a quote: anyone in the company with the Purchase portal. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const fileId = z.uuid().safeParse((await params).fileId);
  if (!fileId.success) return new NextResponse('Not found', { status: 404 });
  const s = await getSession();
  if (s.state !== 'ok') return new NextResponse('Not found', { status: 404 });
  const file = await query(async (tx, ctx) => ((await accessiblePortals(tx, ctx)).includes('procurement') ? quoteFiles.quoteFile(tx, ctx.companyId, fileId.data) : null));
  if (!file) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(await presignDownload(file.s3Key, 300));
}
