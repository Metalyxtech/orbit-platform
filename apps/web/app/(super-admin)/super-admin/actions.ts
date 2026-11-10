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
export async function approveCompanyAction(rawId: string) {
  const userId = await requireSuperAdmin();
  const companyId = z.uuid().parse(rawId);
  const db = await getDb();
  const [wf] = await db
    .select()
    .from(workflowDefinitions)
    .where(eq(workflowDefinitions.key, timesheetManifest.defaultWorkflowKey))
    .orderBy(desc(workflowDefinitions.version))
    .limit(1);
  await db.update(companies).set({ status: 'active' }).where(eq(companies.id, companyId));
  await withTenant(db, { companyId, userId }, async (tx) => {
    await tx.update(memberships).set({ status: 'active' }).where(and(eq(memberships.companyId, companyId), eq(memberships.status, 'pending')));
    await tx
      .insert(companyPortals)
      .values({ companyId, portal: 'timesheet', enabled: true, workflowDefinitionId: wf?.id })
      .onConflictDoUpdate({ target: [companyPortals.companyId, companyPortals.portal], set: { enabled: true } });
    await audit(tx, { companyId, actorId: null, action: 'company.approve', entity: 'companies', entityId: companyId, data: { superAdminUserId: userId } });
  });
  revalidatePath('/super-admin');
}

export async function setStageAction(rawId: string, rawStage: 'sandbox' | 'pilot' | 'live') {
  const userId = await requireSuperAdmin();
  const companyId = z.uuid().parse(rawId);
  const stage = z.enum(['sandbox', 'pilot', 'live']).parse(rawStage);
  const db = await getDb();
  const [before] = await db.select({ stage: companies.stage }).from(companies).where(eq(companies.id, companyId));
  if (!before) throw new Error('Company not found');
  if (before.stage === stage) return;
  await db.update(companies).set({ stage }).where(eq(companies.id, companyId));
  // Stage decides who receives real email, so every change is on the company's audit trail.
  await withTenant(db, { companyId, userId }, (tx) =>
    audit(tx, {
      companyId,
      actorId: null,
      action: 'company.set_stage',
      entity: 'companies',
      entityId: companyId,
      data: { from: before.stage, to: stage, superAdminUserId: userId },
    }),
  );
  revalidatePath('/super-admin');
}

/** Sandbox reset: the company-purge Lambda deletes transactional rows and the S3 prefix. */
export async function resetSandboxAction(rawId: string) {
  const userId = await requireSuperAdmin();
  const companyId = z.uuid().parse(rawId);
  const db = await getDb();
  const [c] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!c || c.stage !== 'sandbox') throw new Error('Only sandbox companies can be reset');
  const effects = new Effects();
  const scope = { companyId, userId };
  await withTenant(db, scope, async (tx) => {
    await effects.emit(tx, newEvent('company.purge_requested', { companyId, companyStage: c.stage, requestId: uuidv7() }, { reason: 'sandbox_reset' }));
    await audit(tx, {
      companyId,
      actorId: null,
      action: 'company.sandbox_reset',
      entity: 'companies',
      entityId: companyId,
      data: { superAdminUserId: userId },
    });
  });
  await effects.flush(db, scope);
  revalidatePath('/super-admin');
}
