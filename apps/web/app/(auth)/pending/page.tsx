import { redirect } from 'next/navigation';
import { getSession } from '@orbit/core/next';
import { AuthCard } from '../AuthCard';

export const dynamic = 'force-dynamic';

export default async function Pending() {
  const s = await getSession();
  if (s.state === 'ok') redirect('/');
  if (s.state === 'signed_out') redirect('/sign-in');
  return (
    <AuthCard title={s.state === 'pending' && s.blocked ? 'Access blocked' : 'Waiting for approval'}>
      <p className="muted">
        {s.state !== 'pending'
          ? 'Your account is not linked to a company yet.'
          : s.blocked
            ? `Your access to ${s.companyName} has been blocked. Contact your company admin or Orbit support.`
            : `Your request to join ${s.companyName} is waiting for approval. Sign in again once your admin has approved it.`}
      </p>
      <a className="o-btn" href="/auth/sign-out">
        Sign out
      </a>
    </AuthCard>
  );
}
