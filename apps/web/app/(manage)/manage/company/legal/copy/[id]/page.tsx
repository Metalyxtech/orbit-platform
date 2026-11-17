import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { getSession, query } from '@orbit/core/next';
import { SignedCopyView } from '@/legal/SignedCopyView';
import { signedCopy } from '@/legal/state';

export const dynamic = 'force-dynamic';

/** Company admin > Terms and privacy > one signed copy (the company's own records only). */
export default async function CompanySignedCopy({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (s.state !== 'ok' || s.ctx.role !== 'company_admin') redirect('/manage');
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const c = await query((tx) => signedCopy(tx, id.data));
  if (!c) notFound();
  return (
    <>
      <header className="o-top">
        <span className="faint">
          <Link href="/manage/company/legal">Terms and privacy</Link> /
        </span>
        <strong>Signed copy</strong>
      </header>
      <div className="o-page">
        <SignedCopyView c={c} />
      </div>
    </>
  );
}
