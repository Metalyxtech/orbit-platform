import { redirect } from 'next/navigation';
import { readMemberPortals } from '@orbit/core';
import { cookies } from 'next/headers';
import { COMPANY_COOKIE, getSession, query } from '@orbit/core/next';
import { accessiblePortals } from '@/portal-access';
import { requireAgreement } from '@/legal/gate';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const s = await getSession();
  if (s.state === 'signed_out') redirect('/sign-in');
  if (s.state === 'pending') redirect('/pending');
  // In several companies and none chosen yet in this sign-in: ask which one to open.
  if (s.state === 'ok' && s.companies.length > 1) {
    const chosen = (await cookies()).get(COMPANY_COOKIE)?.value;
    if (!s.companies.some((c) => c.id === chosen)) redirect('/choose-company');
  }
  await requireAgreement(s);
  if (s.state === 'no_company') redirect(s.isSuperAdmin ? '/super-admin' : '/register');
  // Management (GM / CEO) start in the Management workspace, above every portal.
  if (s.state === 'ok' && s.ctx.role === 'management') redirect('/manage');
  const { open, waiting } = await query(async (tx, ctx) => ({
    open: await accessiblePortals(tx, ctx),
    waiting: (await readMemberPortals(tx, [ctx.membershipId])).some((r) => r.status === 'requested'),
  }));
  // One portal and nothing pending: straight in. Otherwise the chooser shows what is open and what waits.
  if (open.length === 1 && !waiting) redirect(`/${open[0]}`);
  redirect(open.length || waiting ? '/portals' : '/pending?reason=portals');
}
