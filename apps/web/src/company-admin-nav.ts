import type { SessionContext } from '@orbit/core';
import { portalNavItems } from './portal-nav';
import { portalModules } from './portals';

export type AdminNavItem = { href: string; label: string; group: string };

/**
 * The one Company admin menu: company-wide pages first, then every portal's settings under the
 * portal's name. Used by the Management workspace and by every portal's sidebar.
 */
export function companyAdminItems(ctx: Pick<SessionContext, 'role'>, portals: string[], roles: Record<string, string | null>): AdminNavItem[] {
  if (ctx.role !== 'company_admin') return [];
  const items: AdminNavItem[] = [
    { href: '/manage/company/people', label: 'People and portals', group: 'Company' },
    { href: '/manage/company/portals', label: 'Company portals', group: 'Company' },
  ];
  for (const p of portals.filter((x) => portalModules[x])) {
    const group = portalModules[p].manifest.name;
    for (const n of portalNavItems(p, ctx, {}, roles[p] ?? null).filter((x) => x.section === 'admin')) items.push({ href: n.href, label: n.label, group });
  }
  return items;
}
