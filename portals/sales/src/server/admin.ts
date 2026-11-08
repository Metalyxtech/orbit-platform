import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit, portalRoleFor, readPortalRoles, writePortalRole, type ActionContext, type SessionContext } from '@orbit/core';
import { memberships, users, type Tx } from '@orbit/db';
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
}

/** Active people with their sales role. */
export async function salesTeam(tx: Tx, ctx: SessionContext): Promise<SalesPerson[]> {
  const people = await tx
    .select({ id: memberships.id, name: users.name, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.status, 'active')));
  const roles = await readPortalRoles(tx, PORTAL, people.map((p) => p.id));
  return people
    .map((p) => ({ membershipId: p.id, name: p.name, email: p.email, companyRole: p.role, salesRole: portalRoleFor(salesManifest, p.role, roles.get(p.id)) as SalesRole }))
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

/** Gives a person their sales role. Company admins are always sales admins. */
export async function setSalesRole(tx: Tx, ctx: ActionContext, raw: { membershipId: string; role: string }) {
  requireAdmin(ctx);
  const v = z.object({ membershipId: z.uuid(), role: z.enum(roleIds) }).parse(raw);
  const m = (await salesTeam(tx, ctx)).find((x) => x.membershipId === v.membershipId);
  if (!m) throw new Error('Person not found');
  if (m.companyRole === 'company_admin') throw new Error('Company admins are always sales admins');
  if (v.role === 'admin') throw new Error('Make the person a company admin to give them sales admin');
  if (!(await writePortalRole(tx, { companyId: ctx.companyId, membershipId: m.membershipId, portal: PORTAL, role: v.role }))) throw new Error('Sales roles switch on after the latest database update.');
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'sales.role', entity: 'memberships', entityId: m.membershipId, data: { summary: [`${m.name}: ${roleLabel(m.salesRole)} → ${roleLabel(v.role)}`] }, requestId: ctx.requestId });
  return { role: v.role };
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
