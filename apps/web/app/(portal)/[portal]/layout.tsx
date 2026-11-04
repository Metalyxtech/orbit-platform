import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSession, query } from '@orbit/core/next';
import { AppShell } from '@orbit/ui';
import { unreadCount } from '@/messages';
import { isManager, workspaceFor } from '@/management/workspaces';
import { accessiblePortals } from '@/portal-access';
import { portalNavItems } from '@/portal-nav';
import { portalRolesFor, queueCounts } from '@/portal-role';
import { BRAND, portalModules } from '@/portals';
import { switchCompanyAction } from '@/session-actions';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children, params }: { children: ReactNode; params: Promise<{ portal: string }> }) {
  const { portal } = await params;
  const mod = portalModules[portal];
  if (!mod) notFound();

  const { ctx, enabled, waiting, unread, portalRole } = await query(async (tx, ctx) => ({
    ctx,
    enabled: await accessiblePortals(tx, ctx),
    waiting: (await queueCounts(tx, ctx, [portal]))[portal],
    unread: await unreadCount(tx, ctx),
    portalRole: (await portalRolesFor(tx, ctx, [portal]))[portal],
  }));
  if (!enabled.includes(portal)) redirect('/');
  const session = await getSession();
  const companies = session.state === 'ok' ? session.companies : [];

  const nav = portalNavItems(portal, ctx, { approvals: waiting }, portalRole);
  // Management and admins get a way back to the Management workspace from any portal.
  if (isManager(ctx)) {
    nav.unshift({ href: workspaceFor(ctx).modules[portal] ? `/manage/${portal}` : '/manage', label: 'Management view', section: 'main', badge: undefined });
  }
  nav.push({ href: '/manage/messages', label: 'Messages', section: 'main', badge: unread || undefined });
  // Company-wide admin pages, reachable from every portal.
  if (ctx.role === 'company_admin') {
    nav.push({ href: '/manage/company/people', label: 'People and portals', section: 'admin', badge: undefined });
    nav.push({ href: '/manage/company/portals', label: 'Company portals', section: 'admin', badge: undefined });
  }

  return (
    <AppShell
      brand={BRAND}
      companyName={ctx.companyName}
      portalName={mod.manifest.name}
      portals={enabled.filter((p) => portalModules[p]).map((p) => ({ id: p, name: portalModules[p].manifest.name }))}
      companies={companies}
      onSwitchCompany={switchCompanyAction}
      nav={nav}
      user={{ name: ctx.name, title: ctx.title }}
      signOutHref="/auth/sign-out"
    >
      {ctx.companyStage === 'sandbox' && (
        <div className="o-banner info" style={{ borderRadius: 0 }}>
          Sandbox company: emails only go to verified test addresses.
        </div>
      )}
      {children}
    </AppShell>
  );
}
