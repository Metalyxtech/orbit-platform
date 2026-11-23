import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { memberships, tsAdminCovers, users, type Tx } from '@orbit/db';
import { assertRole, readAdminCovers, TS_COVER_ROLES, type TsCoverRole } from './shared';

// Company admins who also act as Supervisor, Project manager or Management for timesheet approvals.
// Role steps add them as approvers; people with no supervisor (or projects with no PM) go to them.

const LABEL: Record<TsCoverRole, string> = { supervisor: 'Supervisor', project_manager: 'Project manager', management: 'Management' };
const pgMissing = (err: unknown) => /ts_admin_covers/.test(String(err)) || (err as { cause?: { code?: string } })?.cause?.code === '42P01';

export interface AdminCoverView {
  /** False until migration 0026 has run. */
  ready: boolean;
  roles: { id: TsCoverRole; label: string }[];
  admins: { membershipId: string; name: string; email: string; covers: TsCoverRole[] }[];
  /** Active people per role (role holders, not admins). */
  holders: Record<TsCoverRole, number>;
}

export async function adminCovers(tx: Tx, ctx: SessionContext): Promise<AdminCoverView> {
  assertRole(ctx, 'company_admin');
  const people = await tx
    .select({ id: memberships.id, name: users.name, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.status, 'active'), inArray(memberships.role, ['company_admin', ...TS_COVER_ROLES])));
  let ready = true;
  let covers = new Map<string, TsCoverRole[]>();
  try {
    await tx.transaction((sp) => sp.select({ id: tsAdminCovers.membershipId }).from(tsAdminCovers).limit(1));
    covers = await readAdminCovers(tx, ctx.companyId);
  } catch (err) {
    if (!pgMissing(err)) throw err;
    ready = false;
  }
  return {
    ready,
    roles: TS_COVER_ROLES.map((id) => ({ id, label: LABEL[id] })),
    admins: people
      .filter((p) => p.role === 'company_admin')
      .map((p) => ({ membershipId: p.id, name: p.name, email: p.email, covers: covers.get(p.id) ?? [] }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    holders: Object.fromEntries(TS_COVER_ROLES.map((r) => [r, people.filter((p) => p.role === r).length])) as Record<TsCoverRole, number>,
  };
}

const coverInput = z.object({
  changes: z.array(z.object({ membershipId: z.uuid(), covers: z.array(z.enum(TS_COVER_ROLES)).max(3) })).min(1).max(100),
});

export async function saveAdminCovers(tx: Tx, ctx: ActionContext, raw: z.input<typeof coverInput>) {
  assertRole(ctx, 'company_admin');
  const v = coverInput.parse(raw);
  const view = await adminCovers(tx, ctx);
  if (!view.ready) throw new Error('Admin cover switches on after the latest database update.');
  for (const c of v.changes) {
    const a = view.admins.find((x) => x.membershipId === c.membershipId);
    if (!a) throw new Error('Only company admins can cover timesheet roles. Reload the page.');
    const roles = TS_COVER_ROLES.filter((r) => c.covers.includes(r));
    await tx
      .insert(tsAdminCovers)
      .values({ companyId: ctx.companyId, membershipId: a.membershipId, roles })
      .onConflictDoUpdate({ target: [tsAdminCovers.companyId, tsAdminCovers.membershipId], set: { roles, updatedAt: new Date() } });
    await audit(tx, {
      companyId: ctx.companyId,
      actorId: ctx.membershipId,
      action: 'timesheet.cover',
      entity: 'memberships',
      entityId: a.membershipId,
      data: { summary: [`${a.name}: timesheet admin, also approves as ${roles.length ? roles.map((r) => LABEL[r]).join(', ') : 'no other role'}`] },
      requestId: ctx.requestId,
    });
  }
  return { ok: true as const };
}
