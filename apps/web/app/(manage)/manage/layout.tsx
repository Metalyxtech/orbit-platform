import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSession, query } from '@orbit/core/next';
import { approvals } from '@orbit/portal-timesheet/server';
import { NotificationCenter, SideFoot, SideMenu } from '@orbit/ui';
import { BillingBanner } from '@/billing/BillingBanner';
import { unreadCount } from '@/messages';
import { accessiblePortals } from '@/portal-access';
import { portalRolesFor, queueCounts } from '@/portal-role';
import { BRAND } from '@/portals';
import { workspaceFor } from '@/management/workspaces';
import { manageNavSections } from './nav-groups';
import { CompanySwitcher } from '@/CompanySwitcher';
import { requireAgreement } from '@/legal/gate';
import { projectDocsOn } from '@/project-docs';
import { canControl, heldCount } from '@orbit/core/holds';

export const dynamic = 'force-dynamic';

/** Management workspace (GM / CEO and company admins): one place above every portal. */
export default async function ManageLayout({ children }: { children: ReactNode }) {
  const s = await getSession();
  if (s.state !== 'ok') redirect('/');
  await requireAgreement(s);
  // Everyone can read and send messages here; the overview and approvals are for management and admins.
  const ws = workspaceFor(s.ctx);
  const d = await query(async (tx, ctx) => {
    const portals = await accessiblePortals(tx, ctx);
    return {
      portals,
      waiting: await approvals.countMine(tx, ctx),
      unread: await unreadCount(tx, ctx),
      badges: await queueCounts(tx, ctx, portals),
      roles: await portalRolesFor(tx, ctx, portals),
      projectDocs: await projectDocsOn(tx, ctx),
      held: canControl(ctx) ? await heldCount(tx, ctx.companyId) : 0,
    };
  });
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
          <NotificationCenter />
        </div>
        <SideMenu sections={manageNavSections(ctx, ws, d.portals, d)} />
        <SideFoot name={ctx.name} title={ctx.title ?? (ctx.role === 'management' ? 'Management' : 'Company admin')}>
          <CompanySwitcher companies={s.companies} current={ctx.companyId} />
        </SideFoot>
      </aside>
      <div className="o-main">
        <BillingBanner role={ctx.role} />
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
