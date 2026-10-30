import type { ReactNode } from 'react';
import { requireSuperAdminPage } from './data';
import { SuperNav } from './SuperNav';

export const dynamic = 'force-dynamic';

/** Super Admin shell: its own sidebar, so new sections slot in as menu items. */
export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  const me = await requireSuperAdminPage();
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
        <SuperNav />
        <div className="o-side-foot">
          <strong>{me.name}</strong>
          Super Admin
          {me.hasCompany && (
            <div>
              <a href="/" style={{ color: '#9aa3ab', fontSize: 12 }}>
                Back to portals
              </a>
            </div>
          )}
          <div>
            <a href="/auth/sign-out" style={{ color: '#9aa3ab', fontSize: 12 }}>
              Sign out
            </a>
          </div>
        </div>
      </aside>
      <div className="o-main">{children}</div>
    </div>
  );
}
