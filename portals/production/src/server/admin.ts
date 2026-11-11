import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit, legacyPortal, portalRoleFor, readMemberPortals, readPortalRoles, setMemberPortal, writePortalRole, type ActionContext, type SessionContext } from '@orbit/core';
import { companyPortals, memberships, users, type Tx } from '@orbit/db';
import { PROD_ROLES, roleLabel, type ProdConfig, type ProdRole } from '../config';
import { productionManifest } from '../manifest';
import { TRADES } from '../trades';
import { loadConfig, PORTAL, saveConfig } from './shared';

// Production settings for the company admin: trades in use, rules, and who does what.
// The page keeps everything as a draft; saveProductionAdmin applies it in one transaction.

const requireAdmin = (ctx: SessionContext) => {
  if (ctx.role !== 'company_admin') throw new Error('Only a company admin can change production settings');
};

export interface ProdPerson {
  membershipId: string;
  name: string;
  email: string;
  companyRole: SessionContext['role'];
  prodRole: ProdRole;
  /** on = can open the Production portal; requested = asked for it; off = no access. */
  access: 'on' | 'requested' | 'off';
}

export async function productionTeam(tx: Tx, ctx: SessionContext): Promise<ProdPerson[]> {
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
      const access: ProdPerson['access'] =
        p.role === 'company_admin' || p.role === 'management' ? 'on'
        : row ? (row.status === 'active' ? 'on' : row.status === 'requested' ? 'requested' : 'off')
        : mine.length === 0 && legacyPortal(PORTAL) ? 'on'
        : 'off';
      return { membershipId: p.id, name: p.name, email: p.email, companyRole: p.role, prodRole: portalRoleFor(productionManifest, p.role, roles.get(p.id)) as ProdRole, access };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const roleIds = PROD_ROLES.map((r) => r.id) as [ProdRole, ...ProdRole[]];
const adminInput = z.object({
  settings: z
    .object({
      trades: z.array(z.string().refine((t) => TRADES.some((x) => x.id === t))).max(50),
      overrunPct: z.number().min(0).max(50),
      requireRelease: z.boolean(),
      requireFinalQc: z.boolean(),
    })
    .optional(),
  team: z.array(z.object({ membershipId: z.uuid(), role: z.enum(roleIds).optional(), access: z.enum(['on', 'off']).optional() })).max(1000).default([]),
});

export async function saveProductionAdmin(tx: Tx, ctx: ActionContext, raw: z.input<typeof adminInput>) {
  requireAdmin(ctx);
  const v = adminInput.parse(raw);
  if (v.settings) {
    const old = await loadConfig(tx, ctx.companyId);
    const next: ProdConfig = { ...old, ...v.settings };
    await saveConfig(tx, ctx.companyId, next);
    const changed = (Object.keys(v.settings) as (keyof ProdConfig)[]).filter((k) => JSON.stringify(old[k]) !== JSON.stringify(next[k])).map((k) => `${k}: ${JSON.stringify(old[k])} → ${JSON.stringify(next[k])}`.slice(0, 200));
    await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'production.settings', entity: 'prod_settings', entityId: ctx.companyId, data: { summary: changed.length ? changed : ['Production settings saved'] }, requestId: ctx.requestId });
  }
  if (!v.team.length) return { ok: true as const };
  const team = new Map((await productionTeam(tx, ctx)).map((p) => [p.membershipId, p]));
  const [cp] = await tx.select({ enabled: companyPortals.enabled }).from(companyPortals).where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.portal, PORTAL)));
  for (const c of v.team) {
    const m = team.get(c.membershipId);
    if (!m) throw new Error('Someone on the list has left the company. Reload the page.');
    if (c.role && c.role !== m.prodRole) {
      if (m.companyRole === 'company_admin') throw new Error('Company admins are always production admins');
      if (c.role === 'admin') throw new Error('Make the person a company admin to give them production admin');
      if (!(await writePortalRole(tx, { companyId: ctx.companyId, membershipId: m.membershipId, portal: PORTAL, role: c.role }))) throw new Error('Production roles switch on after the latest database update.');
      await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'production.role', entity: 'memberships', entityId: m.membershipId, data: { summary: [`${m.name}: ${roleLabel(m.prodRole)} → ${roleLabel(c.role)}`] }, requestId: ctx.requestId });
    }
    if (c.access && c.access !== m.access) {
      if (m.companyRole === 'company_admin' || m.companyRole === 'management') throw new Error('Company admins and management always have Production');
      if (!cp?.enabled) throw new Error('Production is not switched on for your company yet. Request it in Company portals first.');
      await setMemberPortal(tx, ctx.companyId, m.membershipId, PORTAL, c.access === 'on' ? 'active' : 'off');
      await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: c.access === 'on' ? 'member_portal.grant' : 'member_portal.remove', entity: 'memberships', entityId: m.membershipId, data: { portal: PORTAL, summary: [`${m.name}: Production portal ${c.access === 'on' ? 'opened' : 'closed'}`] }, requestId: ctx.requestId });
    }
  }
  return { ok: true as const };
}
