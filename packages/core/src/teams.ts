import { and, desc, eq, inArray } from 'drizzle-orm';
import { companyPortals, memberships, projects, projectTeamMembers, projectTeams, salesCustomers, salesOrders, users, type Tx } from '@orbit/db';
import { audit } from './audit';
import type { ActionContext, SessionContext } from './session';

// Project teams. A project is a sales order (Sales portal) or, for a company without Sales, a
// project the GM or an admin enters in the company project list. The GM or a company admin puts
// people on it: engineers, supervisors, managers, store keepers, QC. A project that has a team is
// seen only by its team, the GM and company admins, in every portal; a project without a team, and
// records not tied to any project, stay visible to everyone as before. Portals ask projectScope()
// and filter their own lists, pages and task lists by the sales order a record belongs to.

/** The GM and company admins set up teams and see every project. */
export const canManageTeams = (ctx: Pick<SessionContext, 'role'>) => ctx.role === 'management' || ctx.role === 'company_admin';

export interface ProjectScope {
  /** Sees every project (GM, admin, or teams not set up yet). */
  all: boolean;
  /** True when this person may see a record of this project: a sales order id or a company project id (null = no project). */
  sees: (projectKey: string | null | undefined) => boolean;
}
const ALL: ProjectScope = { all: true, sees: () => true };

const missing = (err: unknown) => {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '42P01' || /relation "project_team/.test(String(err));
};

const noColumn = (err: unknown) => {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '42703' || /column "project_id" does not exist/.test(String(err));
};

/** Every team with its project key; works before migration 0030 (sales orders only then). */
async function teamKeys(tx: Tx, companyId: string): Promise<{ id: string; key: string }[]> {
  try {
    return await tx.transaction(async (sp) =>
      (await sp.select({ id: projectTeams.id, order: projectTeams.salesOrderId, project: projectTeams.projectId }).from(projectTeams).where(eq(projectTeams.companyId, companyId))).map((t) => ({ id: t.id, key: (t.order ?? t.project)! })),
    );
  } catch (err) {
    if (!noColumn(err)) throw err;
    return (await tx.select({ id: projectTeams.id, order: projectTeams.salesOrderId }).from(projectTeams).where(eq(projectTeams.companyId, companyId))).map((t) => ({ id: t.id, key: t.order! }));
  }
}

/** What this person may see. Everyone sees everything until a project gets a team (or before migration 0029). */
export async function projectScope(tx: Tx, ctx: SessionContext): Promise<ProjectScope> {
  if (canManageTeams(ctx)) return ALL;
  try {
    return await tx.transaction(async (sp) => {
      const teams = (await teamKeys(sp, ctx.companyId)).map((t) => ({ id: t.id, order: t.key }));
      if (!teams.length) return ALL;
      const mine = await sp
        .select({ team: projectTeamMembers.teamId })
        .from(projectTeamMembers)
        .where(and(eq(projectTeamMembers.companyId, ctx.companyId), eq(projectTeamMembers.membershipId, ctx.membershipId)));
      const guarded = new Set(teams.map((t) => t.order));
      const myTeams = new Set(mine.map((m) => m.team));
      const allowed = new Set(teams.filter((t) => myTeams.has(t.id)).map((t) => t.order));
      return { all: false, sees: (o) => !o || !guarded.has(o) || allowed.has(o) };
    });
  } catch (err) {
    if (missing(err)) return ALL;
    throw err;
  }
}

/** The projects (sales orders) this person is on, for "My projects" filters and pickers. */
export async function myProjects(tx: Tx, ctx: SessionContext) {
  try {
    return await tx.transaction(async (sp) => {
      const keys = new Map((await teamKeys(sp, ctx.companyId)).map((t) => [t.id, t.key]));
      const mine = await sp.select({ team: projectTeamMembers.teamId }).from(projectTeamMembers).where(and(eq(projectTeamMembers.companyId, ctx.companyId), eq(projectTeamMembers.membershipId, ctx.membershipId)));
      return mine.map((m) => keys.get(m.team)).filter((k): k is string => !!k);
    });
  } catch {
    return [];
  }
}

const ROLE: Record<string, string> = { management: 'GM / management', company_admin: 'Company admin', project_manager: 'Project manager', supervisor: 'Supervisor', employee: 'Employee' };

/** True when the company uses the Sales portal: projects then come from Sales. */
export async function salesOn(tx: Tx, companyId: string) {
  const [r] = await tx.select({ enabled: companyPortals.enabled }).from(companyPortals).where(and(eq(companyPortals.companyId, companyId), eq(companyPortals.portal, 'sales')));
  return r?.enabled === true;
}

export type ProjectKind = 'sales' | 'own';
export interface ProjectRow {
  kind: ProjectKind;
  /** Sales order id or company project id: what records and teams point to. */
  key: string;
  number: string;
  title: string;
  customer: string | null;
  status: string;
  members: string[];
}

/** Company projects (entered here or in Timesheet), for companies without Sales. */
export async function ownProjects(tx: Tx, companyId: string) {
  return tx.select({ id: projects.id, code: projects.code, name: projects.name, status: projects.status }).from(projects).where(eq(projects.companyId, companyId)).orderBy(projects.code);
}

/**
 * Projects with their teams, and the people who can be added (Management → Project teams).
 * With the Sales portal the projects are its sales orders; without it, the company's own projects,
 * which the GM or an admin adds here.
 */
export async function teamsOverview(tx: Tx, ctx: SessionContext) {
  if (!canManageTeams(ctx)) throw new Error('Only the GM or a company admin can set up project teams');
  const fromSales = await salesOn(tx, ctx.companyId);
  const base: Omit<ProjectRow, 'members'>[] = fromSales
    ? (
        await tx
          .select({ id: salesOrders.id, number: salesOrders.number, title: salesOrders.title, status: salesOrders.status, customer: salesCustomers.name })
          .from(salesOrders)
          .innerJoin(salesCustomers, eq(salesCustomers.id, salesOrders.customerId))
          .where(eq(salesOrders.companyId, ctx.companyId))
          .orderBy(desc(salesOrders.createdAt))
          .limit(500)
      ).map((o) => ({ kind: 'sales' as const, key: o.id, number: o.number, title: o.title, customer: o.customer, status: o.status }))
    : (await ownProjects(tx, ctx.companyId)).map((p) => ({ kind: 'own' as const, key: p.id, number: p.code, title: p.name, customer: null, status: p.status }));
  const people = await tx
    .select({ id: memberships.id, name: users.name, email: users.email, role: memberships.role, title: memberships.title })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.status, 'active')));
  let teams: { key: string; member: string }[] = [];
  let ready = true;
  try {
    teams = await tx.transaction(async (sp) => {
      const keys = new Map((await teamKeys(sp, ctx.companyId)).map((t) => [t.id, t.key]));
      const members = await sp.select({ team: projectTeamMembers.teamId, member: projectTeamMembers.membershipId }).from(projectTeamMembers).where(eq(projectTeamMembers.companyId, ctx.companyId));
      return members.filter((m) => keys.has(m.team)).map((m) => ({ key: keys.get(m.team)!, member: m.member }));
    });
  } catch (err) {
    if (!missing(err)) throw err;
    ready = false;
  }
  return {
    ready,
    fromSales,
    projects: base.map((p): ProjectRow => ({ ...p, members: teams.filter((t) => t.key === p.key).map((t) => t.member) })),
    people: people
      .filter((p) => p.role !== 'management' && p.role !== 'company_admin')
      .map((p) => ({ id: p.id, name: p.name, email: p.email, title: p.title, role: ROLE[p.role] ?? p.role }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** A company without Sales enters its projects (they also appear in Timesheet and Purchase). */
export async function addProject(tx: Tx, ctx: ActionContext, input: { code: string; name: string }) {
  if (!canManageTeams(ctx)) throw new Error('Only the GM or a company admin can add projects');
  const code = input.code.trim().toUpperCase().slice(0, 20);
  const name = input.name.trim().slice(0, 120);
  if (!/^[A-Z0-9][A-Z0-9-_/.]*$/.test(code)) throw new Error('Give the project a short code (letters, numbers, - or /), e.g. PRJ-101');
  if (name.length < 2) throw new Error('Give the project a name');
  if (await salesOn(tx, ctx.companyId)) throw new Error('Your company uses Sales: projects come from won sales orders');
  const [dup] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.companyId, ctx.companyId), eq(projects.code, code)));
  if (dup) throw new Error(`There is already a project ${code}`);
  const [p] = await tx.insert(projects).values({ companyId: ctx.companyId, code, name }).returning({ id: projects.id });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'team.project', entity: 'projects', entityId: p.id, data: { summary: [`Project ${code} ${name} added`] }, requestId: ctx.requestId });
  return { id: p.id };
}

/** Sets a project's team (an empty list removes the team: the project is open to everyone again). */
export async function saveTeam(tx: Tx, ctx: ActionContext, input: { kind: ProjectKind; key: string; memberIds: string[] }) {
  if (!canManageTeams(ctx)) throw new Error('Only the GM or a company admin can set up project teams');
  const ids = [...new Set(input.memberIds)].slice(0, 300);
  const [o] =
    input.kind === 'sales'
      ? await tx.select({ id: salesOrders.id, number: salesOrders.number, title: salesOrders.title }).from(salesOrders).where(and(eq(salesOrders.id, input.key), eq(salesOrders.companyId, ctx.companyId)))
      : await tx.select({ id: projects.id, number: projects.code, title: projects.name }).from(projects).where(and(eq(projects.id, input.key), eq(projects.companyId, ctx.companyId)));
  if (!o) throw new Error('Project not found');
  if (ids.length) {
    const ok = await tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.companyId, ctx.companyId), inArray(memberships.id, ids)));
    if (ok.length !== ids.length) throw new Error('Someone on the team has left the company. Reload the page.');
  }
  const existing = (await teamKeys(tx, ctx.companyId)).find((t) => t.key === o.id);
  if (!ids.length) {
    if (existing) await tx.delete(projectTeams).where(eq(projectTeams.id, existing.id));
  } else {
    const teamId = existing
      ? (await tx.update(projectTeams).set({ updatedAt: new Date() }).where(eq(projectTeams.id, existing.id)).returning({ id: projectTeams.id }))[0].id
      : (
          await tx
            .insert(projectTeams)
            .values({ companyId: ctx.companyId, ...(input.kind === 'sales' ? { salesOrderId: o.id } : { projectId: o.id }), createdBy: ctx.membershipId })
            .returning({ id: projectTeams.id })
        )[0].id;
    await tx.delete(projectTeamMembers).where(eq(projectTeamMembers.teamId, teamId));
    await tx.insert(projectTeamMembers).values(ids.map((membershipId) => ({ teamId, companyId: ctx.companyId, membershipId })));
  }
  await audit(tx, {
    companyId: ctx.companyId,
    actorId: ctx.membershipId,
    action: 'team.save',
    entity: input.kind === 'sales' ? 'sales_orders' : 'projects',
    entityId: o.id,
    data: { summary: [ids.length ? `${o.number} ${o.title}: project team of ${ids.length}` : `${o.number} ${o.title}: team removed, open to everyone`] },
    requestId: ctx.requestId,
  });
  return { ok: true as const };
}
