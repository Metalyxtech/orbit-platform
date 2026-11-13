import { and, eq } from 'drizzle-orm';
import { legacyPortal, portalRoleFor, readMemberPortals, readPortalRoles, type SessionContext } from '@orbit/core';
import { companyPortals, memberships, users, type Tx } from '@orbit/db';
import type { ProcRole } from '../config';
import { procurementManifest } from '../manifest';
import { loadConfig, PORTAL } from './shared';

export interface TeamMember {
  membershipId: string;
  name: string;
  email: string;
  title: string | null;
  companyRole: SessionContext['role'];
  purchaseRole: ProcRole;
  /** Extra roles a purchase admin covers. */
  covers: ProcRole[];
  /** on = can open the Purchase portal; requested = waiting for Orbit; off = no access. */
  access: 'on' | 'requested' | 'off';
}

/** Active people in the company with their purchase role and Purchase portal access. */
export async function purchaseTeam(tx: Tx, ctx: SessionContext): Promise<TeamMember[]> {
  const people = await tx
    .select({ id: memberships.id, name: users.name, email: users.email, title: memberships.title, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.status, 'active')));
  const ids = people.map((p) => p.id);
  const [roles, rows, cp, cfg] = await Promise.all([
    readPortalRoles(tx, PORTAL, ids),
    readMemberPortals(tx, ids),
    tx.select({ enabled: companyPortals.enabled }).from(companyPortals).where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.portal, PORTAL))),
    loadConfig(tx, ctx.companyId),
  ]);
  const companyOn = cp[0]?.enabled === true;
  return people
    .map((p) => {
      const mine = rows.filter((r) => r.membershipId === p.id);
      const row = mine.find((r) => r.portal === PORTAL);
      const access: TeamMember['access'] =
        !companyOn ? 'off'
        : p.role === 'company_admin' || p.role === 'management' ? 'on'
        : row ? (row.status === 'active' ? 'on' : row.status === 'requested' ? 'requested' : 'off')
        : mine.length === 0 && legacyPortal(PORTAL) ? 'on'
        : 'off';
      return {
        membershipId: p.id,
        name: p.name,
        email: p.email,
        title: p.title,
        companyRole: p.role,
        purchaseRole: portalRoleFor(procurementManifest, p.role, roles.get(p.id)) as ProcRole,
        covers: p.role === 'company_admin' ? (cfg.covers?.[p.id] ?? []) : [],
        access,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Names of the people who hold a purchase role (and can open the portal), including admins covering it. */
export async function holdersOf(tx: Tx, ctx: SessionContext, role: ProcRole | null) {
  if (!role) return [];
  return (await purchaseTeam(tx, ctx))
    .filter((m) => m.access === 'on' && (m.purchaseRole === role || m.covers.includes(role)))
    .map((m) => (m.purchaseRole === role ? m.name : `${m.name} (admin, covering)`));
}
