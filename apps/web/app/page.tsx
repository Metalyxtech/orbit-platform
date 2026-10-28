import { redirect } from 'next/navigation';
import { getSession } from '@orbit/core/next';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const s = await getSession();
  if (s.state === 'signed_out') redirect('/sign-in');
  if (s.state === 'pending') redirect('/pending');
  if (s.state === 'no_company') redirect(s.isSuperAdmin ? '/super-admin' : '/register');
  redirect('/timesheet');
}
