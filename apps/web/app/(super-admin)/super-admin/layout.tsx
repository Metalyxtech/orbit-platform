import type { ReactNode } from 'react';
import { requireSuperAdminPage } from './data';
import { SideFoot } from '@orbit/ui';
import { SuperNav } from './SuperNav';
import { superAdminBadges } from './badges';

export const dynamic = 'force-dynamic';

/** Super Admin shell: its own sidebar, so new sections slot in as menu items. */
export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  const me = await requireSuperAdminPage();
  const { requests: total, payments, custom } = await superAdminBadges(me.userId);
  return (
    <div className="o-shell">
      <aside className="o-side">
        <div className="o-brand">
          <div className="o-brand-mark" aria-hidden />
          <div>
            <div className="o-brand-name">Orbit</div>
            <div className="o-brand-co">Super Admin</div>
          </div>
        </div>
        <div className="o-nav-title">Platform</div>
        <SuperNav requests={total} payments={payments} custom={custom} />
        <SideFoot name={me.name} title="Super Admin">
          {me.hasCompany && <a href="/">Back to portals</a>}
        </SideFoot>
      </aside>
      <div className="o-main">{children}</div>
    </div>
  );
}
