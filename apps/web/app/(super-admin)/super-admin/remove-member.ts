import { and, eq, ne } from 'drizzle-orm';
import { memberPortals, memberships, projects, workflowTasks, type Tx } from '@orbit/db';

/** The word the Super Admin must type to confirm a removal. */
export const REMOVE_WORD = 'REMOVE';

const pgCode = (err: unknown) => (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;

/**
 * Removes one person from one company. The membership is kept as 'removed' so timesheets and
 * approval history stay intact, but it no longer counts at sign-in: the person can join or
 * register another company. Links to them are cleared so nothing waits on someone who left.
 * Runs inside the company's RLS scope (the caller's transaction).
 */
export async function removeMembership(tx: Tx, companyId: string, membershipId: string) {
  const [m] = await tx
    .select({ id: memberships.id, role: memberships.role, status: memberships.status })
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.companyId, companyId)));
  if (!m || (m.status as string) === 'removed') throw new Error('This person is not in the company');

  const admins = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.companyId, companyId),
        eq(memberships.role, 'company_admin'),
        eq(memberships.status, 'active'),
        ne(memberships.id, membershipId),
      ),
    );
  if (m.role === 'company_admin' && admins.length === 0) {
    throw new Error('This is the only company admin. Make someone else company admin first.');
  }

  try {
    await tx.transaction((sp) =>
      sp.update(memberships).set({ status: 'removed', supervisorId: null }).where(eq(memberships.id, membershipId)),
    );
  } catch (err) {
    if (pgCode(err) === '22P02') throw new Error('Run the latest database update (pnpm db:migrate) to remove people.');
    throw err;
  }

  const unsupervised = await tx
    .update(memberships)
    .set({ supervisorId: null })
    .where(and(eq(memberships.companyId, companyId), eq(memberships.supervisorId, membershipId)))
    .returning({ id: memberships.id });
  const unmanaged = await tx
    .update(projects)
    .set({ pmId: null })
    .where(and(eq(projects.companyId, companyId), eq(projects.pmId, membershipId)))
    .returning({ id: projects.id });
  // Approvals waiting on them move to a company admin so no timesheet gets stuck.
  const moved = admins.length
    ? await tx
        .update(workflowTasks)
        .set({ assigneeId: admins[0].id })
        .where(and(eq(workflowTasks.companyId, companyId), eq(workflowTasks.assigneeId, membershipId), eq(workflowTasks.status, 'pending')))
        .returning({ id: workflowTasks.id })
    : [];
  try {
    await tx.transaction((sp) => sp.delete(memberPortals).where(eq(memberPortals.membershipId, membershipId)));
  } catch {
    // member_portals does not exist before migration 0005; nothing to clear then.
  }
  return { supervisorLinksCleared: unsupervised.length, projectsWithoutManager: unmanaged.length, approvalsMoved: moved.length };
}

/** True when the typed confirmation matches (case and spaces ignored). */
export const confirmed = (typed: string) => typed.trim().toUpperCase() === REMOVE_WORD;
