import Link from 'next/link';
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
        <div className="o-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>Need a portal we don&apos;t offer?</h2>
            <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
              Orbit can build a custom portal for {s.ctx.companyName} from your own forms and workflow, alongside the portals you use now.
            </p>
          </div>
          <Link className="o-btn primary" href="/manage/company/custom">
            Request a custom portal
          </Link>
        </div>
      </div>
    </>
  );
}
