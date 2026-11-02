import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSession, query } from '@orbit/core/next';
import { approvals } from '@orbit/portal-timesheet/server';
import { unreadCount } from '@/messages';
import { accessiblePortals } from '@/portal-access';
import { BRAND, portalModules } from '@/portals';
import { ManageNav } from './ManageNav';

export const dynamic = 'force-dynamic';

/** Management workspace (GM / CEO and company admins): one place above every portal. */
export default async function ManageLayout({ children }: { children: ReactNode }) {
  const s = await getSession();
  if (s.state !== 'ok') redirect('/');
  // Everyone can read and send messages here; the overview and approvals are for management and admins.
  const manager = s.ctx.role === 'management' || s.ctx.role === 'company_admin';
  const d = await query(async (tx, ctx) => ({
    portals: await accessiblePortals(tx, ctx),
    waiting: await approvals.countMine(tx, ctx),
    unread: await unreadCount(tx, ctx),
  }));
  const ctx = s.ctx;
  return (
    <div className="o-shell">
      <aside className="o-side">
        <div className="o-brand">
          <div className="o-brand-mark" aria-hidden />
          <div>
            <div className="o-brand-name">{BRAND}</div>
            <div className="o-brand-co">{ctx.companyName}</div>
          </div>
        </div>
        <ManageNav
          title={manager ? 'Management' : 'Workspace'}
          main={
            manager
              ? [
                  { href: '/manage', label: 'Overview' },
                  { href: '/manage/approvals', label: 'My approvals', badge: d.waiting },
                  { href: '/manage/messages', label: 'Messages', badge: d.unread },
                  { href: '/timesheet/reports', label: 'Reports' },
                  { href: '/timesheet/team', label: 'Team' },
                ]
              : [{ href: '/manage/messages', label: 'Messages', badge: d.unread }]
          }
          portals={d.portals.map((p) => ({ href: `/${p}`, label: portalModules[p].manifest.name }))}
        />
        <div className="o-side-foot">
          <strong>{ctx.name}</strong>
          {ctx.title ?? (ctx.role === 'management' ? 'Management' : 'Company admin')}
          <div>
            <a href="/auth/sign-out" style={{ color: '#9aa3ab', fontSize: 12 }}>
              Sign out
            </a>
          </div>
        </div>
      </aside>
      <div className="o-main">
        {ctx.companyStage === 'sandbox' && (
          <div className="o-banner info" style={{ borderRadius: 0 }}>
            Sandbox company: emails only go to verified test addresses.
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
