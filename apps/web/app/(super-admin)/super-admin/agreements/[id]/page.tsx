import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getDb } from '@orbit/core/next';
import { withTenant } from '@orbit/db';
import { SignedCopyView } from '@/legal/SignedCopyView';
import { signedCopy } from '@/legal/state';
import { requireSuperAdminPage } from '../../data';

export const dynamic = 'force-dynamic';

/** Super Admin > Agreements > one signed copy, to print or save as PDF for Orbit's records. */
export default async function SignedCopyPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSuperAdminPage();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const db = await getDb();
  const c = await withTenant(db, { companyId: '00000000-0000-0000-0000-000000000000', userId: me.userId }, (tx) => signedCopy(tx, id.data));
  if (!c) notFound();
  return (
    <>
      <header className="o-top">
        <span className="faint">
          <Link href="/super-admin/agreements">Agreements</Link> /
        </span>
        <strong>Signed copy</strong>
      </header>
      <div className="o-page">
        <SignedCopyView c={c} />
      </div>
    </>
  );
}
