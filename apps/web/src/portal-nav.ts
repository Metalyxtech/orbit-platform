import type { SessionContext } from '@orbit/core';
import { portalModules } from './portals';

export type NavItem = { href: string; label: string; section: 'main' | 'admin'; badge?: number };

/**
 * A portal's menu for this person, built from its manifest (roles filter, badges).
 * Used by the portal's own sidebar and by the Management workspace sidebar.
 */
export function portalNavItems(
  portal: string,
  ctx: Pick<SessionContext, 'role'>,
  badges: { approvals?: number } = {},
  portalRole: string | null = null,
): NavItem[] {
  const mod = portalModules[portal];
  if (!mod) return [];
  return mod.manifest.nav
    .filter((n) => navAllowed(n, ctx.role, portalRole))
    .map((n) => ({
      href: `/${portal}${n.path ? `/${n.path}` : ''}`,
      label: n.label,
      section: n.section,
      badge: n.badge === 'approvals' ? badges.approvals || undefined : undefined,
    }));
}

/** Whether a menu item (and its page) is open to this company role and portal role. */
export function navAllowed(n: { roles?: SessionContext['role'][]; portalRoles?: string[] }, role: SessionContext['role'], portalRole: string | null) {
  if (n.roles && !n.roles.includes(role) && role !== 'company_admin') return false;
  if (n.portalRoles && !(portalRole && n.portalRoles.includes(portalRole))) return false;
  return true;
}
