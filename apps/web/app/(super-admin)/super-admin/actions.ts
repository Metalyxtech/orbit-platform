'use server';
import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit, Effects, newEvent, uuidv7 } from '@orbit/core';
import { getDb, getSession } from '@orbit/core/next';
import { companies, companyPortals, memberships, withTenant, workflowDefinitions } from '@orbit/db';
import { timesheetManifest } from '@orbit/portal-timesheet/manifest';

async function requireSuperAdmin() {
  const s = await getSession();
  const isSuper = (s.state === 'ok' && s.ctx.isSuperAdmin) || ((s.state === 'no_company' || s.state === 'pending') && s.isSuperAdmin);
  if (!isSuper) throw new Error('Super Admin only');
  return s.state === 'ok' ? s.ctx.userId : s.state === 'no_company' ? s.userId : '00000000-0000-0000-0000-000000000000';
}

/** Approves a registered company: activates it, its first admin, and the Timesheet portal. */
export async function approveCompanyAction(companyId: string) {
  const userId = await requireSuperAdmin();
  const db = await getDb();
  const [wf] = await db
    .select()
    .from(workflowDefinitions)
    .where(eq(workflowDefinitions.key, timesheetManifest.defaultWorkflowKey))
    .orderBy(desc(workflowDefinitions.version))
    .limit(1);
  await db.update(companies).set({ status: 'active' }).where(eq(companies.id, z.uuid().parse(companyId)));
  await withTenant(db, { companyId, userId }, async (tx) => {
    await tx.update(memberships).set({ status: 'active' }).where(and(eq(memberships.companyId, companyId), eq(memberships.status, 'pending')));
    await tx
      .insert(companyPortals)
      .values({ companyId, portal: 'timesheet', enabled: true, workflowDefinitionId: wf?.id })
      .onConflictDoUpdate({ target: [companyPortals.companyId, companyPortals.portal], set: { enabled: true } });
    await audit(tx, { companyId, actorId: null, action: 'company.approve', entity: 'companies', entityId: companyId });
  });
  revalidatePath('/super-admin', 'layout');
}

/** Block (suspend) or unblock a company. Its people see "Access blocked" until it is unblocked. */
export async function setCompanyBlockedAction(companyId: string, blocked: boolean) {
  const userId = await requireSuperAdmin();
  const db = await getDb();
  const id = z.uuid().parse(companyId);
  const [c] = await db.select().from(companies).where(eq(companies.id, id));
  if (!c || c.status === 'pending') throw new Error('Approve the company first');
  await db.update(companies).set({ status: blocked ? 'suspended' : 'active' }).where(eq(companies.id, id));
  await withTenant(db, { companyId: id, userId }, (tx) =>
    audit(tx, { companyId: id, actorId: null, action: blocked ? 'company.block' : 'company.unblock', entity: 'companies', entityId: id }),
  );
  revalidatePath('/super-admin', 'layout');
}

/** Block or unblock one person in one company (for example a company admin). */
export async function setMemberBlockedAction(companyId: string, membershipId: string, blocked: boolean) {
  const userId = await requireSuperAdmin();
  const db = await getDb();
  const id = z.uuid().parse(membershipId);
  await withTenant(db, { companyId, userId }, async (tx) => {
    await tx
      .update(memberships)
      .set({ status: blocked ? 'disabled' : 'active' })
      .where(and(eq(memberships.id, id), eq(memberships.companyId, companyId)));
    await audit(tx, { companyId, actorId: null, action: blocked ? 'membership.block' : 'membership.unblock', entity: 'memberships', entityId: id });
  });
  revalidatePath('/super-admin', 'layout');
}

export async function setStageAction(companyId: string, stage: 'sandbox' | 'pilot' | 'live') {
  await requireSuperAdmin();
  const db = await getDb();
  await db.update(companies).set({ stage: z.enum(['sandbox', 'pilot', 'live']).parse(stage) }).where(eq(companies.id, companyId));
  revalidatePath('/super-admin', 'layout');
}

/** Sandbox reset: the company-purge Lambda deletes transactional rows and the S3 prefix. */
export async function resetSandboxAction(companyId: string) {
  const userId = await requireSuperAdmin();
  const db = await getDb();
  const [c] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!c || c.stage !== 'sandbox') throw new Error('Only sandbox companies can be reset');
  const effects = new Effects();
  const scope = { companyId, userId };
  await withTenant(db, scope, (tx) =>
    effects.emit(tx, newEvent('company.purge_requested', { companyId, companyStage: c.stage, requestId: uuidv7() }, { reason: 'sandbox_reset' })),
  );
  await effects.flush(db, scope);
  revalidatePath('/super-admin', 'layout');
}
