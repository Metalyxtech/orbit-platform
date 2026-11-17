import { redirect } from 'next/navigation';
import { getSession } from '@orbit/core/next';
import { SignOutButton } from '@orbit/ui';
import { AuthCard } from '../AuthCard';

export const dynamic = 'force-dynamic';

export default async function Pending({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const s = await getSession();
  if (s.state === 'signed_out') redirect('/sign-in');
  if (s.state === 'ok') {
    if ((await searchParams).reason !== 'portals') redirect('/');
    return (
      <AuthCard title="Portals waiting for approval">
        <p className="muted">
          {s.ctx.companyName} is set up, but none of its portals are switched on for you yet. Orbit switches on the portals your
          company asked for after review. Sign in again later, or ask your company admin.
        </p>
        <SignOutButton />
      </AuthCard>
    );
  }
  return (
    <AuthCard title={s.state === 'pending' && s.blocked ? 'Access blocked' : 'Waiting for approval'}>
      <p className="muted">
        {s.state !== 'pending'
          ? 'Your account is not linked to a company yet.'
          : s.blocked
            ? `Your access to ${s.companyName} has been blocked. Contact your company admin or Orbit support.`
            : `Your request to join ${s.companyName} is waiting for approval. Sign in again once your admin has approved it.`}
      </p>
      <SignOutButton />
    </AuthCard>
  );
}
