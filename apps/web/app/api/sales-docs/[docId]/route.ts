import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { presignDownload } from '@orbit/core/aws';
import { getSession, query } from '@orbit/core/next';
import { docFile } from '@orbit/portal-sales/server';
import { projectDocsOn } from '@/project-docs';

export const dynamic = 'force-dynamic';

/** Opens a project document uploaded in Sales: anyone in the company while Sales is on. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const docId = z.uuid().safeParse((await params).docId);
  if (!docId.success) return new NextResponse('Not found', { status: 404 });
  const s = await getSession();
  if (s.state !== 'ok') return new NextResponse('Not found', { status: 404 });
  const file = await query(async (tx, ctx) => ((await projectDocsOn(tx, ctx)) ? docFile(tx, ctx.companyId, docId.data) : null));
  if (!file?.s3Key) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(await presignDownload(file.s3Key, 300));
}
