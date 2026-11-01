import { redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { accessiblePortals } from '@/portal-access';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const s = await getSession();
  if (s.state === 'signed_out') redirect('/sign-in');
  if (s.state === 'pending') redirect('/pending');
  if (s.state === 'no_company') redirect(s.isSuperAdmin ? '/super-admin' : '/register');
  const portals = await query((tx, ctx) => accessiblePortals(tx, ctx));
  redirect(portals.length ? `/${portals[0]}` : '/pending?reason=portals');
}
