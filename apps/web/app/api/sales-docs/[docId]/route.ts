import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { presignDownload } from '@orbit/core/aws';
import { getSession, query } from '@orbit/core/next';
import { docFile, myRole } from '@orbit/portal-sales/server';
import { accessiblePortals } from '@/portal-access';
import { projectDocsOn } from '@/project-docs';

/** Costing attachments carry costs: only the estimator, sales manager, GM and sales admin open them. */
const COSTING_ROLES = ['estimator', 'manager', 'gm', 'admin'];

export const dynamic = 'force-dynamic';

/** Opens a document uploaded in Sales: project documents for anyone in the company while Sales is on; costing attachments for estimating and management. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const docId = z.uuid().safeParse((await params).docId);
  if (!docId.success) return new NextResponse('Not found', { status: 404 });
  const s = await getSession();
  if (s.state !== 'ok') return new NextResponse('Not found', { status: 404 });
  const file = await query(async (tx, ctx) => {
    if (!(await projectDocsOn(tx, ctx))) return null;
    const f = await docFile(tx, ctx.companyId, docId.data);
    if (f?.section === 'costing' && !((await accessiblePortals(tx, ctx)).includes('sales') && COSTING_ROLES.includes(await myRole(tx, ctx)))) return null;
    return f;
  });
  if (!file?.s3Key) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(await presignDownload(file.s3Key, 300));
}
