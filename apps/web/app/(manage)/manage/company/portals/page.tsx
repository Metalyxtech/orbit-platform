import { redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { companyPortalList } from '@/company-admin/portals';
import { PortalsClient } from './PortalsClient';

export const dynamic = 'force-dynamic';

/** Company admin > Company portals: the portals Orbit offers and which ones the company uses. */
export default async function CompanyPortals() {
  const s = await getSession();
  if (s.state !== 'ok' || s.ctx.role !== 'company_admin') redirect('/manage');
  const portals = await query((tx, ctx) => companyPortalList(tx, ctx));
  return (
    <>
      <header className="o-top">
        <strong>Company portals</strong>
      </header>
      <div className="o-page">
        <div>
          <h1>Company portals</h1>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Add a portal for {s.ctx.companyName}. Orbit reviews the request and switches it on; then you give it to people in People and portals.
          </p>
        </div>
        <PortalsClient portals={portals} />
      </div>
    </>
  );
}
