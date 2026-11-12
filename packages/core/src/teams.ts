import { and, desc, eq, inArray } from 'drizzle-orm';
import { memberships, projectTeamMembers, projectTeams, salesCustomers, salesOrders, users, type Tx } from '@orbit/db';
import { audit } from './audit';
import type { ActionContext, SessionContext } from './session';

// Project teams. A project is a won sales order. The GM (management) or a company admin puts
// people on it: engineers, supervisors, managers, store keepers, QC. A project that has a team is
// seen only by its team, the GM and company admins, in every portal; a project without a team, and
// records not tied to any project, stay visible to everyone as before. Portals ask projectScope()
// and filter their own lists, pages and task lists by the sales order a record belongs to.

/** The GM and company admins set up teams and see every project. */
export const canManageTeams = (ctx: Pick<SessionContext, 'role'>) => ctx.role === 'management' || ctx.role === 'company_admin';

export interface ProjectScope {
  /** Sees every project (GM, admin, or teams not set up yet). */
  all: boolean;
  /** True when this person may see a record of this sales order (null = no project). */
  sees: (salesOrderId: string | null | undefined) => boolean;
}
const ALL: ProjectScope = { all: true, sees: () => true };

const missing = (err: unknown) => {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '42P01' || /relation "project_team/.test(String(err));
};

/** What this person may see. Everyone sees everything until a project gets a team (or before migration 0029). */
export async function projectScope(tx: Tx, ctx: SessionContext): Promise<ProjectScope> {
  if (canManageTeams(ctx)) return ALL;
  try {
    return await tx.transaction(async (sp) => {
      const teams = await sp.select({ id: projectTeams.id, order: projectTeams.salesOrderId }).from(projectTeams).where(eq(projectTeams.companyId, ctx.companyId));
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
    return await tx.transaction(async (sp) =>
      (
        await sp
          .select({ order: projectTeams.salesOrderId })
          .from(projectTeamMembers)
          .innerJoin(projectTeams, eq(projectTeams.id, projectTeamMembers.teamId))
          .where(and(eq(projectTeamMembers.companyId, ctx.companyId), eq(projectTeamMembers.membershipId, ctx.membershipId)))
      ).map((r) => r.order),
    );
  } catch {
    return [];
  }
}

const ROLE: Record<string, string> = { management: 'GM / management', company_admin: 'Company admin', project_manager: 'Project manager', supervisor: 'Supervisor', employee: 'Employee' };

/** Projects with their teams, and the people who can be added (Management → Project teams). */
export async function teamsOverview(tx: Tx, ctx: SessionContext) {
  if (!canManageTeams(ctx)) throw new Error('Only the GM or a company admin can set up project teams');
  const orders = await tx
    .select({ id: salesOrders.id, number: salesOrders.number, title: salesOrders.title, status: salesOrders.status, customer: salesCustomers.name, createdAt: salesOrders.createdAt })
    .from(salesOrders)
    .innerJoin(salesCustomers, eq(salesCustomers.id, salesOrders.customerId))
    .where(eq(salesOrders.companyId, ctx.companyId))
    .orderBy(desc(salesOrders.createdAt))
    .limit(500);
  const people = await tx
    .select({ id: memberships.id, name: users.name, email: users.email, role: memberships.role, title: memberships.title })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.status, 'active')));
  let teams: { order: string; member: string; at: Date }[] = [];
  let ready = true;
  try {
    teams = await tx.transaction((sp) =>
      sp
        .select({ order: projectTeams.salesOrderId, member: projectTeamMembers.membershipId, at: projectTeams.updatedAt })
        .from(projectTeams)
        .innerJoin(projectTeamMembers, eq(projectTeamMembers.teamId, projectTeams.id))
        .where(eq(projectTeams.companyId, ctx.companyId)),
    );
  } catch (err) {
    if (!missing(err)) throw err;
    ready = false;
  }
  return {
    ready,
    projects: orders.map((o) => ({ ...o, createdAt: o.createdAt.toISOString(), members: teams.filter((t) => t.order === o.id).map((t) => t.member) })),
    people: people
      .filter((p) => p.role !== 'management' && p.role !== 'company_admin')
      .map((p) => ({ id: p.id, name: p.name, email: p.email, title: p.title, role: ROLE[p.role] ?? p.role }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Sets a project's team (an empty list removes the team: the project is open to everyone again). */
export async function saveTeam(tx: Tx, ctx: ActionContext, input: { salesOrderId: string; memberIds: string[] }) {
  if (!canManageTeams(ctx)) throw new Error('Only the GM or a company admin can set up project teams');
  const ids = [...new Set(input.memberIds)].slice(0, 300);
  const [o] = await tx.select({ id: salesOrders.id, number: salesOrders.number, title: salesOrders.title }).from(salesOrders).where(and(eq(salesOrders.id, input.salesOrderId), eq(salesOrders.companyId, ctx.companyId)));
  if (!o) throw new Error('Project not found');
  if (ids.length) {
    const ok = await tx.select({ id: memberships.id, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.companyId, ctx.companyId), inArray(memberships.id, ids)));
    if (ok.length !== ids.length) throw new Error('Someone on the team has left the company. Reload the page.');
  }
  const [existing] = await tx.select({ id: projectTeams.id }).from(projectTeams).where(and(eq(projectTeams.companyId, ctx.companyId), eq(projectTeams.salesOrderId, o.id)));
  if (!ids.length) {
    if (existing) await tx.delete(projectTeams).where(eq(projectTeams.id, existing.id));
  } else {
    const teamId = existing
      ? (await tx.update(projectTeams).set({ updatedAt: new Date() }).where(eq(projectTeams.id, existing.id)).returning({ id: projectTeams.id }))[0].id
      : (await tx.insert(projectTeams).values({ companyId: ctx.companyId, salesOrderId: o.id, createdBy: ctx.membershipId }).returning({ id: projectTeams.id }))[0].id;
    await tx.delete(projectTeamMembers).where(eq(projectTeamMembers.teamId, teamId));
    await tx.insert(projectTeamMembers).values(ids.map((membershipId) => ({ teamId, companyId: ctx.companyId, membershipId })));
  }
  await audit(tx, {
    companyId: ctx.companyId,
    actorId: ctx.membershipId,
    action: 'team.save',
    entity: 'sales_orders',
    entityId: o.id,
    data: { summary: [ids.length ? `${o.number} ${o.title}: project team of ${ids.length}` : `${o.number} ${o.title}: team removed, open to everyone`] },
    requestId: ctx.requestId,
  });
  return { ok: true as const };
}
