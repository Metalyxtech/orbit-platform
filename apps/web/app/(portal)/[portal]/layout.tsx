import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSession, query } from '@orbit/core/next';
import { AppShell } from '@orbit/ui';
import { BillingBanner } from '@/billing/BillingBanner';
import { unreadCount } from '@/messages';
import { isManager, workspaceFor } from '@/management/workspaces';
import { accessiblePortals } from '@/portal-access';
import { companyAdminItems } from '@/company-admin-nav';
import { portalNavItems } from '@/portal-nav';
import { portalRolesFor, queueCounts } from '@/portal-role';
import { BRAND, portalModules } from '@/portals';
import { switchCompanyAction } from '@/session-actions';
import { requireAgreement } from '@/legal/gate';
import { PROJECT_DOCS_HREF, projectDocsOn } from '@/project-docs';

export const dynamic = 'force-dynamic';

const COMPANY_ROLE: Record<string, string> = {
  employee: 'Employee',
  supervisor: 'Supervisor',
  project_manager: 'Project manager',
  management: 'Management',
  company_admin: 'Company admin',
};

export default async function PortalLayout({ children, params }: { children: ReactNode; params: Promise<{ portal: string }> }) {
  const { portal } = await params;
  const mod = portalModules[portal];
  if (!mod) notFound();
  await requireAgreement(await getSession());

  const { ctx, enabled, waiting, unread, roles, docs } = await query(async (tx, ctx) => ({
    ctx,
    enabled: await accessiblePortals(tx, ctx),
    waiting: (await queueCounts(tx, ctx, [portal]))[portal],
    unread: await unreadCount(tx, ctx),
    roles: await portalRolesFor(tx, ctx, Object.keys(portalModules)),
    docs: portal !== 'sales' && (await projectDocsOn(tx, ctx)),
  }));
  const portalRole = roles[portal];
  if (!enabled.includes(portal)) redirect('/');
  const session = await getSession();
  const companies = session.state === 'ok' ? session.companies : [];

  const nav = portalNavItems(portal, ctx, { approvals: waiting }, portalRole);
  // Management and admins get a way back to the Management workspace from any portal.
  if (isManager(ctx)) {
    nav.unshift({ href: workspaceFor(ctx).modules[portal] ? `/manage/${portal}` : '/manage', label: 'Management view', section: 'main', badge: undefined });
  }
  // Customer project documents from Sales, readable from every other portal.
  if (docs) nav.push({ href: PROJECT_DOCS_HREF, label: 'Project documents', section: 'main', badge: undefined });
  nav.push({ href: '/manage/messages', label: 'Messages', section: 'main', badge: unread || undefined });
  // One Company admin menu (company pages and every portal's settings), the same in every portal.
  const adminNav = companyAdminItems(ctx, enabled, roles).map((n) => ({ ...n, section: 'admin' as const, badge: undefined }));
  // The footer shows who the person is in this portal (e.g. "Estimator · Sales"), not their job title elsewhere.
  const roleHere = mod.manifest.portalRoles?.find((r) => r.id === portalRole)?.label ?? COMPANY_ROLE[ctx.role] ?? ctx.role;
  const shellNav = [...nav.filter((n) => n.section !== 'admin'), ...adminNav];

  return (
    <AppShell
      brand={BRAND}
      companyName={ctx.companyName}
      portalName={mod.manifest.name}
      portals={enabled.filter((p) => portalModules[p]).map((p) => ({ id: p, name: portalModules[p].manifest.name }))}
      companies={companies}
      onSwitchCompany={switchCompanyAction}
      nav={shellNav}
      user={{ name: ctx.name, role: roleHere, title: `${mod.manifest.name} portal` }}
      signOutHref="/auth/sign-out"
    >
      <BillingBanner role={ctx.role} />
      {ctx.companyStage === 'sandbox' && (
        <div className="o-banner info" style={{ borderRadius: 0 }}>
          Sandbox company: emails only go to verified test addresses.
        </div>
      )}
      {children}
    </AppShell>
  );
}
