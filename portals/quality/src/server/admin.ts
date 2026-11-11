import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit, legacyPortal, portalRoleFor, readMemberPortals, readPortalRoles, setMemberPortal, writePortalRole, type ActionContext, type SessionContext } from '@orbit/core';
import { companyPortals, memberships, users, type Tx } from '@orbit/db';
import { QC_ROLES, roleLabel, type QcRole } from '../config';
import { qualityManifest } from '../manifest';
import { PORTAL } from './shared';

// Quality settings for the company admin: who does what. The page keeps everything as a draft;
// saveQualityAdmin applies it in one transaction.

const requireAdmin = (ctx: SessionContext) => {
  if (ctx.role !== 'company_admin') throw new Error('Only a company admin can change quality settings');
};

export interface QcPerson {
  membershipId: string;
  name: string;
  email: string;
  companyRole: SessionContext['role'];
  qcRole: QcRole;
  /** on = can open the Quality portal; requested = asked for it; off = no access. */
  access: 'on' | 'requested' | 'off';
}

export async function qualityTeam(tx: Tx, ctx: SessionContext): Promise<QcPerson[]> {
  const people = await tx
    .select({ id: memberships.id, name: users.name, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.status, 'active')));
  const ids = people.map((p) => p.id);
  const [roles, rows] = await Promise.all([readPortalRoles(tx, PORTAL, ids), readMemberPortals(tx, ids)]);
  return people
    .map((p) => {
      const mine = rows.filter((r) => r.membershipId === p.id);
      const row = mine.find((r) => r.portal === PORTAL);
      const access: QcPerson['access'] =
        p.role === 'company_admin' || p.role === 'management' ? 'on'
        : row ? (row.status === 'active' ? 'on' : row.status === 'requested' ? 'requested' : 'off')
        : mine.length === 0 && legacyPortal(PORTAL) ? 'on'
        : 'off';
      return { membershipId: p.id, name: p.name, email: p.email, companyRole: p.role, qcRole: portalRoleFor(qualityManifest, p.role, roles.get(p.id)) as QcRole, access };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const roleIds = QC_ROLES.map((r) => r.id) as [QcRole, ...QcRole[]];
const adminInput = z.object({
  team: z.array(z.object({ membershipId: z.uuid(), role: z.enum(roleIds).optional(), access: z.enum(['on', 'off']).optional() })).max(1000).default([]),
});

export async function saveQualityAdmin(tx: Tx, ctx: ActionContext, raw: z.input<typeof adminInput>) {
  requireAdmin(ctx);
  const v = adminInput.parse(raw);
  if (!v.team.length) return { ok: true as const };
  const team = new Map((await qualityTeam(tx, ctx)).map((p) => [p.membershipId, p]));
  const [cp] = await tx.select({ enabled: companyPortals.enabled }).from(companyPortals).where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.portal, PORTAL)));
  for (const c of v.team) {
    const m = team.get(c.membershipId);
    if (!m) throw new Error('Someone on the list has left the company. Reload the page.');
    if (c.role && c.role !== m.qcRole) {
      if (m.companyRole === 'company_admin') throw new Error('Company admins are always quality admins');
      if (c.role === 'admin') throw new Error('Make the person a company admin to give them quality admin');
      if (!(await writePortalRole(tx, { companyId: ctx.companyId, membershipId: m.membershipId, portal: PORTAL, role: c.role }))) throw new Error('Quality roles switch on after the latest database update.');
      await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'quality.role', entity: 'memberships', entityId: m.membershipId, data: { summary: [`${m.name}: ${roleLabel(m.qcRole)} → ${roleLabel(c.role)}`] }, requestId: ctx.requestId });
    }
    if (c.access && c.access !== m.access) {
      if (m.companyRole === 'company_admin' || m.companyRole === 'management') throw new Error('Company admins and management always have Quality');
      if (!cp?.enabled) throw new Error('Quality is not switched on for your company yet. Request it in Company portals first.');
      await setMemberPortal(tx, ctx.companyId, m.membershipId, PORTAL, c.access === 'on' ? 'active' : 'off');
      await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: c.access === 'on' ? 'member_portal.grant' : 'member_portal.remove', entity: 'memberships', entityId: m.membershipId, data: { portal: PORTAL, summary: [`${m.name}: Quality portal ${c.access === 'on' ? 'opened' : 'closed'}`] }, requestId: ctx.requestId });
    }
  }
  return { ok: true as const };
}
