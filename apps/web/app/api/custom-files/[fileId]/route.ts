import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { presignDownload } from '@orbit/core/aws';
import { getDb, getSession } from '@orbit/core/next';
import { withTenant } from '@orbit/db';
import { requestFile } from '@/custom/requests';

export const dynamic = 'force-dynamic';

/**
 * Opens a file a custom customer uploaded (5-minute link). Super Admin can open any company's
 * files; a company admin only their own company's.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const fileId = z.uuid().safeParse((await params).fileId);
  const companyId = z.uuid().safeParse(req.nextUrl.searchParams.get('c'));
  if (!fileId.success || !companyId.success) return new NextResponse('Not found', { status: 404 });
  const s = await getSession();
  const superUser = s.state === 'ok' ? (s.ctx.isSuperAdmin ? s.ctx.userId : null) : s.state === 'no_company' && s.isSuperAdmin ? s.userId : null;
  const ownAdmin = s.state === 'ok' && s.ctx.role === 'company_admin' && s.ctx.companyId === companyId.data ? s.ctx.userId : null;
  const userId = superUser ?? ownAdmin;
  if (!userId) return new NextResponse('Not found', { status: 404 });
  const db = await getDb();
  const file = await withTenant(db, { companyId: companyId.data, userId }, (tx) => requestFile(tx, companyId.data, fileId.data));
  if (!file) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(await presignDownload(file.s3Key, 300));
}
