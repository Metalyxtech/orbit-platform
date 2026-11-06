import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { activateRequestedPortals, audit, legacyPortal, portalRoleFor, readMemberPortals, readPortalRoles, requestMemberPortals, setMemberPortal, writePortalRole, type ActionContext, type SessionContext } from '@orbit/core';
import { companyPortals, memberships, users, type Tx } from '@orbit/db';
import { assertWithinPlan } from '../billing/state';
import { portalModules } from '../portals';

const requireAdmin = (ctx: SessionContext) => {
  if (ctx.role !== 'company_admin') throw new Error('Only the company admin can manage people');
};

const ROLES = ['employee', 'supervisor', 'project_manager', 'management', 'company_admin'] as const;
export type PortalAccess = 'on' | 'requested' | 'off';

/** People in the company, each with their access to every portal the company has. */
export async function peopleAndPortals(tx: Tx, ctx: SessionContext) {
  requireAdmin(ctx);
  const cps = await tx
    .select({ portal: companyPortals.portal, enabled: companyPortals.enabled })
    .from(companyPortals)
    .where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.enabled, true)));
  const portals = cps.map((c) => c.portal).filter((p) => portalModules[p]);
  const people = await tx
    .select({ id: memberships.id, name: users.name, email: users.email, role: memberships.role, title: memberships.title, status: memberships.status })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.companyId, ctx.companyId), inArray(memberships.status, ['active', 'pending', 'disabled'])));
  const ids = people.map((p) => p.id);
  const rows = await readMemberPortals(tx, ids);
  const roleMaps = Object.fromEntries(await Promise.all(portals.filter((p) => portalModules[p].manifest.portalRoles).map(async (p) => [p, await readPortalRoles(tx, p, ids)] as const)));
  return {
    portals: portals.map((p) => ({ id: p, name: portalModules[p].manifest.name, roles: portalModules[p].manifest.portalRoles ?? null })),
    people: people
      .map((p) => {
        const mine = rows.filter((r) => r.membershipId === p.id);
        const access: Record<string, PortalAccess> = {};
        const portalRole: Record<string, string | null> = {};
        for (const portal of portals) {
          const row = mine.find((r) => r.portal === portal);
          access[portal] =
            p.role === 'company_admin' || p.role === 'management' ? 'on'
            : row ? (row.status === 'active' ? 'on' : row.status === 'requested' ? 'requested' : 'off')
            : mine.length === 0 && legacyPortal(portal) ? 'on'
            : 'off';
          const m = portalModules[portal].manifest;
          portalRole[portal] = m.portalRoles ? portalRoleFor(m, p.role, roleMaps[portal]?.get(p.id)) : null;
        }
        return { membershipId: p.id, name: p.name, email: p.email, role: p.role, title: p.title, status: p.status, access, portalRole };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
export type PeopleData = Awaited<ReturnType<typeof peopleAndPortals>>;

const changeInput = z.object({ membershipId: z.uuid(), portal: z.string().min(1).max(40), action: z.enum(['grant', 'remove']) });

/**
 * Gives or removes a portal for one person. Orbit approves each portal once for the company
 * (Company portals); inside those, the company admin decides who uses what, effective at once.
 */
export async function changePersonPortal(tx: Tx, ctx: ActionContext, raw: z.input<typeof changeInput>) {
  requireAdmin(ctx);
  const input = changeInput.parse(raw);
  const [m] = await tx.select({ id: memberships.id, role: memberships.role }).from(memberships).where(and(eq(memberships.id, input.membershipId), eq(memberships.companyId, ctx.companyId)));
  if (!m) throw new Error('Person not found');
  if (m.role === 'company_admin' || m.role === 'management') throw new Error('Admins and management use every portal the company has');
  const [cp] = await tx.select({ enabled: companyPortals.enabled }).from(companyPortals).where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.portal, input.portal)));
  if (!cp?.enabled) throw new Error('Your company does not have that portal yet. Request it in Company portals first.');
  const status = input.action === 'grant' ? ('active' as const) : ('off' as const);
  await setMemberPortal(tx, ctx.companyId, m.id, input.portal, status);
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: `member_portal.${input.action}`, entity: 'memberships', entityId: m.id, data: { portal: input.portal }, requestId: ctx.requestId });
  return { status };
}

const roleInput = z.object({ membershipId: z.uuid(), portal: z.string().min(1).max(40), role: z.string().min(1).max(40) });

/** Sets a person's role inside a portal that has portal roles (for example Purchase). */
export async function setPersonPortalRole(tx: Tx, ctx: ActionContext, raw: z.input<typeof roleInput>) {
  requireAdmin(ctx);
  const input = roleInput.parse(raw);
  const m = portalModules[input.portal]?.manifest;
  if (!m?.portalRoles?.some((r) => r.id === input.role)) throw new Error('Choose one of the portal roles');
  const [p] = await tx.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.id, input.membershipId), eq(memberships.companyId, ctx.companyId)));
  if (!p) throw new Error('Person not found');
  if (p.role === 'company_admin') throw new Error('Company admins keep the admin role in every portal');
  if (input.role === 'admin') throw new Error('Make the person a company admin to give them the admin role');
  if (!(await writePortalRole(tx, { companyId: ctx.companyId, ...input }))) throw new Error('Portal roles switch on after the latest database update.');
  return { ok: true as const };
}

const addInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  name: z.string().trim().min(2, 'Enter the full name').max(120),
  role: z.enum(ROLES),
  title: z.string().trim().max(100).optional(),
  portals: z.array(z.string()).min(1, 'Choose at least one portal'),
  portalRoles: z.record(z.string(), z.string()).default({}),
});

/**
 * Adds a person with the portals they should use (any portal the company has). They can sign in and
 * use them straight away. Admins and management get every portal.
 */
export async function addPerson(tx: Tx, ctx: ActionContext, raw: z.input<typeof addInput>) {
  requireAdmin(ctx);
  const input = addInput.parse(raw);
  await assertWithinPlan(tx, ctx, 'user');
  const cps = await tx.select({ portal: companyPortals.portal }).from(companyPortals).where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.enabled, true)));
  const allowed = cps.map((c) => c.portal);
  const bad = input.portals.find((p) => !allowed.includes(p));
  if (bad) throw new Error(`Your company does not have ${portalModules[bad]?.manifest.name ?? bad} yet`);
  await tx.insert(users).values({ workosUserId: `invited|${input.email}`, email: input.email, name: input.name }).onConflictDoNothing({ target: users.email });
  const [user] = await tx.select().from(users).where(eq(users.email, input.email));
  const [existing] = await tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.userId, user.id)));
  if (existing) throw new Error(`${input.email} is already in this company`);
  const [m] = await tx
    .insert(memberships)
    .values({ companyId: ctx.companyId, userId: user.id, role: input.role, title: input.title || null, status: 'active' })
    .returning({ id: memberships.id });
  const everyPortal = input.role === 'company_admin' || input.role === 'management';
  // A new person has no portal rows yet: record exactly the chosen portals (not the legacy set), switched on.
  if (!everyPortal) {
    await requestMemberPortals(tx, ctx.companyId, m.id, input.portals);
    await activateRequestedPortals(tx, [m.id]);
  }
  for (const [p, role] of Object.entries(input.portalRoles)) {
    const man = portalModules[p]?.manifest;
    if (input.portals.includes(p) && man?.portalRoles?.some((r) => r.id === role) && role !== 'admin' && input.role !== 'company_admin') {
      await writePortalRole(tx, { companyId: ctx.companyId, membershipId: m.id, portal: p, role });
    }
  }
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'membership.add', entity: 'memberships', entityId: m.id, data: { email: input.email, role: input.role, portals: input.portals }, requestId: ctx.requestId });
  return { ok: true as const };
}
