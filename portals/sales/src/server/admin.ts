import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit, legacyPortal, portalRoleFor, readMemberPortals, readPortalRoles, setMemberPortal, writePortalRole, type ActionContext, type SessionContext } from '@orbit/core';
import { companyPortals, memberships, users, type Tx } from '@orbit/db';
import { roleLabel, SALES_ROLES, type SalesConfig, type SalesRole } from '../config';
import { salesManifest } from '../manifest';
import { loadConfig, myRole, PORTAL, requireRole, saveConfig } from './shared';

// Sales settings (company admin) and monthly targets (sales manager).

const requireAdmin = (ctx: SessionContext) => {
  if (ctx.role !== 'company_admin') throw new Error('Only a company admin can change sales settings');
};

export interface SalesPerson {
  membershipId: string;
  name: string;
  email: string;
  companyRole: SessionContext['role'];
  salesRole: SalesRole;
  /** on = can open the Sales portal; requested = waiting for the admin; off = no access. */
  access: 'on' | 'requested' | 'off';
}

/** Active people with their sales role. */
export async function salesTeam(tx: Tx, ctx: SessionContext): Promise<SalesPerson[]> {
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
      // Same rule as the app's portal access: admins and management always; others need Sales switched on for them.
      const access: SalesPerson['access'] =
        p.role === 'company_admin' || p.role === 'management' ? 'on'
        : row ? (row.status === 'active' ? 'on' : row.status === 'requested' ? 'requested' : 'off')
        : mine.length === 0 && legacyPortal(PORTAL) ? 'on'
        : 'off';
      return { membershipId: p.id, name: p.name, email: p.email, companyRole: p.role, salesRole: portalRoleFor(salesManifest, p.role, roles.get(p.id)) as SalesRole, access };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const settingsInput = z.object({
  managerDiscount: z.number().min(0).max(50),
  minMargin: z.number().min(0).max(90),
  gst: z.number().min(0).max(40),
  currency: z.string().trim().min(1).max(4),
  validityDays: z.number().int().min(1).max(365),
  paymentTermsDays: z.number().int().min(0).max(365),
  defaultAdvance: z.number().int().min(0).max(100),
  terms: z.string().trim().max(2000),
});

export async function saveSettings(tx: Tx, ctx: ActionContext, raw: z.input<typeof settingsInput>) {
  requireAdmin(ctx);
  const v = settingsInput.parse(raw);
  const old = await loadConfig(tx, ctx.companyId);
  const next: SalesConfig = { ...old, ...v };
  await saveConfig(tx, ctx.companyId, next);
  const changed = (Object.keys(v) as (keyof typeof v)[]).filter((k) => old[k] !== next[k]).map((k) => `${k}: ${String(old[k]).slice(0, 40)} → ${String(next[k]).slice(0, 40)}`);
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'sales.settings', entity: 'sales_settings', entityId: ctx.companyId, data: { summary: changed.length ? changed : ['Sales settings saved'] }, requestId: ctx.requestId });
  return { ok: true as const };
}

const roleIds = SALES_ROLES.map((r) => r.id) as [SalesRole, ...SalesRole[]];

async function grantAccess(tx: Tx, ctx: ActionContext, m: SalesPerson, on: boolean) {
  const [cp] = await tx.select({ enabled: companyPortals.enabled }).from(companyPortals).where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.portal, PORTAL)));
  if (!cp?.enabled) throw new Error('Sales is not switched on for your company yet. Request it in Company portals first.');
  await setMemberPortal(tx, ctx.companyId, m.membershipId, PORTAL, on ? 'active' : 'off');
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: on ? 'member_portal.grant' : 'member_portal.remove', entity: 'memberships', entityId: m.membershipId, data: { portal: PORTAL, summary: [`${m.name}: Sales portal ${on ? 'opened' : 'closed'}`] }, requestId: ctx.requestId });
}

const adminInput = z.object({
  settings: settingsInput.optional(),
  team: z
    .array(z.object({ membershipId: z.uuid(), role: z.enum(roleIds).optional(), access: z.enum(['on', 'off']).optional() }))
    .max(1000)
    .default([]),
});

/**
 * Saves the Sales settings page in one go: settings, sales roles and portal access. The page keeps
 * every edit as a draft, so nothing reaches the portal until the admin presses Save changes.
 */
export async function saveSalesAdmin(tx: Tx, ctx: ActionContext, raw: z.input<typeof adminInput>) {
  requireAdmin(ctx);
  const v = adminInput.parse(raw);
  if (v.settings) await saveSettings(tx, ctx, v.settings);
  if (!v.team.length) return { ok: true as const, changed: 0 };
  const team = new Map((await salesTeam(tx, ctx)).map((p) => [p.membershipId, p]));
  let changed = 0;
  for (const c of v.team) {
    const m = team.get(c.membershipId);
    if (!m) throw new Error('Someone on the list has left the company. Reload the page.');
    const fixed = m.companyRole === 'company_admin';
    if (c.role && c.role !== m.salesRole) {
      if (fixed) throw new Error('Company admins are always sales admins');
      if (c.role === 'admin') throw new Error('Make the person a company admin to give them sales admin');
      if (!(await writePortalRole(tx, { companyId: ctx.companyId, membershipId: m.membershipId, portal: PORTAL, role: c.role }))) throw new Error('Sales roles switch on after the latest database update.');
      await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'sales.role', entity: 'memberships', entityId: m.membershipId, data: { summary: [`${m.name}: ${roleLabel(m.salesRole)} → ${roleLabel(c.role)}`] }, requestId: ctx.requestId });
      changed++;
    }
    if (c.access && c.access !== m.access) {
      if (fixed || m.companyRole === 'management') throw new Error('Company admins and management always have Sales');
      await grantAccess(tx, ctx, m, c.access === 'on');
      changed++;
    }
  }
  return { ok: true as const, changed };
}

/** Monthly order targets per salesperson (0 removes the target). */
export async function setTargets(tx: Tx, ctx: ActionContext, raw: { targets: Record<string, number> }) {
  requireRole(await myRole(tx, ctx), 'manager');
  const targets = z.record(z.uuid(), z.number().min(0).max(1e12)).parse(raw.targets);
  const team = new Set((await salesTeam(tx, ctx)).map((p) => p.membershipId));
  const old = await loadConfig(tx, ctx.companyId);
  const next = { ...old.targets };
  for (const [id, v] of Object.entries(targets)) {
    if (!team.has(id)) continue;
    if (v > 0) next[id] = v;
    else delete next[id];
  }
  await saveConfig(tx, ctx.companyId, { ...old, targets: next });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'sales.targets', entity: 'sales_settings', entityId: ctx.companyId, data: { summary: ['Monthly sales targets updated'] }, requestId: ctx.requestId });
  return { ok: true as const };
}
