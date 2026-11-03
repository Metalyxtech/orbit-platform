import type { SessionContext } from '@orbit/core';
import { portalModules } from './portals';

export type NavItem = { href: string; label: string; section: 'main' | 'admin'; badge?: number };

/**
 * A portal's menu for this person, built from its manifest (roles filter, badges).
 * Used by the portal's own sidebar and by the Management workspace sidebar.
 */
export function portalNavItems(portal: string, ctx: Pick<SessionContext, 'role'>, badges: { approvals?: number } = {}): NavItem[] {
  const mod = portalModules[portal];
  if (!mod) return [];
  return mod.manifest.nav
    .filter((n) => !n.roles || n.roles.includes(ctx.role) || ctx.role === 'company_admin')
    .map((n) => ({
      href: `/${portal}${n.path ? `/${n.path}` : ''}`,
      label: n.label,
      section: n.section,
      badge: n.badge === 'approvals' ? badges.approvals || undefined : undefined,
    }));
}
