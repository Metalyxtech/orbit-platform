import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSession, query } from '@orbit/core/next';
import { companyPortals } from '@orbit/db';
import { approvals } from '@orbit/portal-timesheet/server';
import { AppShell } from '@orbit/ui';
import { BRAND, portalModules } from '@/portals';
import { switchCompanyAction } from '@/session-actions';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children, params }: { children: ReactNode; params: Promise<{ portal: string }> }) {
  const { portal } = await params;
  const mod = portalModules[portal];
  if (!mod) notFound();

  const { ctx, enabled, waiting } = await query(async (tx, ctx) => {
    const rows = await tx
      .select({ portal: companyPortals.portal })
      .from(companyPortals)
      .where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.enabled, true)));
    const isApprover = ctx.role !== 'employee';
    return {
      ctx,
      enabled: rows.map((r) => r.portal),
      waiting: isApprover ? await approvals.countMine(tx, ctx) : 0,
    };
  });
  if (!enabled.includes(portal)) notFound();
  const session = await getSession();
  const companies = session.state === 'ok' ? session.companies : [];

  const nav = mod.manifest.nav
    .filter((n) => !n.roles || n.roles.includes(ctx.role) || ctx.role === 'company_admin')
    .map((n) => ({
      href: `/${portal}${n.path ? `/${n.path}` : ''}`,
      label: n.label,
      section: n.section,
      badge: n.badge === 'approvals' ? waiting : undefined,
    }));

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
