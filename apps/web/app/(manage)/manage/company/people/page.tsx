import { redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { billingState } from '@/billing/state';
import { peopleAndPortals } from '@/company-admin/people';
import { PeopleClient } from './PeopleClient';

export const dynamic = 'force-dynamic';

/** Company admin > People and portals: who can open which portal, and their role inside it. */
export default async function PeoplePortals() {
  const s = await getSession();
  if (s.state !== 'ok' || s.ctx.role !== 'company_admin') redirect('/manage');
  const [data, seats] = await query(async (tx, ctx) => {
    const people = await peopleAndPortals(tx, ctx);
    // Seats on a per-user plan, so the admin knows when a new person needs more seats.
    const b = await tx.transaction((sp) => billingState(sp, ctx)).catch(() => null);
    const paid = b && (b.status === 'active' || b.status === 'past_due');
    return [people, paid && b.perUser && b.seats !== null ? { used: b.seatsUsed, total: b.seats } : null] as const;
  });
  return (
    <>
      <header className="o-top">
        <strong>People and portals</strong>
      </header>
      <PeopleClient data={data} me={s.ctx.membershipId} seats={seats} />
    </>
  );
}
