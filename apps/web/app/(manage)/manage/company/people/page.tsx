import { redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { peopleAndPortals } from '@/company-admin/people';
import { PeopleClient } from './PeopleClient';

export const dynamic = 'force-dynamic';

/** Company admin > People and portals: who can open which portal, and their role inside it. */
export default async function PeoplePortals() {
  const s = await getSession();
  if (s.state !== 'ok' || s.ctx.role !== 'company_admin') redirect('/manage');
  const data = await query((tx, ctx) => peopleAndPortals(tx, ctx));
  return (
    <>
      <header className="o-top">
        <strong>People and portals</strong>
      </header>
      <PeopleClient data={data} me={s.ctx.membershipId} />
    </>
  );
}
