import { redirect } from 'next/navigation';
import { getSession } from '@orbit/core/next';
import { AuthCard } from '../AuthCard';

export const dynamic = 'force-dynamic';

export default async function Pending() {
  const s = await getSession();
  if (s.state === 'ok') redirect('/');
  if (s.state === 'signed_out') redirect('/sign-in');
  return (
    <AuthCard title="Waiting for approval">
      <p className="muted">
        {s.state === 'pending'
          ? `Your access to ${s.companyName} is waiting for approval. You will get an email when it is ready.`
          : 'Your account is not linked to a company yet.'}
      </p>
      <a className="o-btn" href="/auth/sign-out">
        Sign out
      </a>
    </AuthCard>
  );
}
