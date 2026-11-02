import { redirect } from 'next/navigation';
import { readMemberPortals } from '@orbit/core';
import { getSession, query } from '@orbit/core/next';
import { accessiblePortals } from '@/portal-access';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const s = await getSession();
  if (s.state === 'signed_out') redirect('/sign-in');
  if (s.state === 'pending') redirect('/pending');
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
