'use server';
import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activateRequestedPortals, audit, Effects, newEvent, setMemberPortal, uuidv7 } from '@orbit/core';
import { getDb, getSession } from '@orbit/core/next';
import { companies, companyPortals, memberships, withTenant, workflowDefinitionColumns, workflowDefinitions, type Tx } from '@orbit/db';
import { portalModules } from '@/portals';
import { timesheetManifest } from '@orbit/portal-timesheet/manifest';

async function requireSuperAdmin() {
  const s = await getSession();
  const isSuper = (s.state === 'ok' && s.ctx.isSuperAdmin) || ((s.state === 'no_company' || s.state === 'pending') && s.isSuperAdmin);
  if (!isSuper) throw new Error('Super Admin only');
  return s.state === 'ok' ? s.ctx.userId : s.state === 'no_company' ? s.userId : '00000000-0000-0000-0000-000000000000';
}

async function defaultWorkflowId(portal: string) {
  if (portal !== timesheetManifest.id) return null;
  const db = await getDb();
  const [wf] = await db
    .select(workflowDefinitionColumns)
    .from(workflowDefinitions)
    .where(eq(workflowDefinitions.key, timesheetManifest.defaultWorkflowKey))
    .orderBy(desc(workflowDefinitions.version))
    .limit(1);
  return wf?.id ?? null;
}

/** Switches one portal on or off for a company. Switching on keeps an existing workflow choice. */
async function setPortal(tx: Tx, companyId: string, portal: string, enabled: boolean) {
  const [row] = await tx
    .select({ workflowDefinitionId: companyPortals.workflowDefinitionId })
    .from(companyPortals)
    .where(and(eq(companyPortals.companyId, companyId), eq(companyPortals.portal, portal)));
  const workflowDefinitionId = row?.workflowDefinitionId ?? (enabled ? await defaultWorkflowId(portal) : null);
  await tx
    .insert(companyPortals)
    .values({ companyId, portal, enabled, workflowDefinitionId })
    .onConflictDoUpdate({ target: [companyPortals.companyId, companyPortals.portal], set: { enabled, workflowDefinitionId } });
}

/**
 * Approves a registered company: activates it, its first admin and every portal it asked for.
 * Companies registered before portal requests existed get the Timesheet portal.
 */
export async function approveCompanyAction(companyId: string) {
  const userId = await requireSuperAdmin();
  const db = await getDb();
  const id = z.uuid().parse(companyId);
  await db.update(companies).set({ status: 'active' }).where(eq(companies.id, id));
  await withTenant(db, { companyId: id, userId }, async (tx) => {
    const approved = await tx
      .update(memberships)
      .set({ status: 'active' })
      .where(and(eq(memberships.companyId, id), eq(memberships.status, 'pending')))
      .returning({ id: memberships.id });
    await activateRequestedPortals(tx, approved.map((m) => m.id));
    const requested = (await tx.select({ portal: companyPortals.portal }).from(companyPortals).where(eq(companyPortals.companyId, id))).map(
      (r) => r.portal,
    );
    for (const portal of requested.length ? requested : [timesheetManifest.id]) await setPortal(tx, id, portal, true);
    await audit(tx, { companyId: id, actorId: null, action: 'company.approve', entity: 'companies', entityId: id, data: { portals: requested } });
  });
  revalidatePath('/super-admin', 'layout');
}

/** Turns one portal on or off for a company. */
export async function setPortalEnabledAction(companyId: string, portal: string, enabled: boolean) {
  const userId = await requireSuperAdmin();
  const id = z.uuid().parse(companyId);
  if (!portalModules[portal]) throw new Error('Unknown portal');
  const db = await getDb();
  await withTenant(db, { companyId: id, userId }, async (tx) => {
    await setPortal(tx, id, portal, enabled);
    await audit(tx, { companyId: id, actorId: null, action: enabled ? 'portal.enable' : 'portal.disable', entity: 'company_portals', entityId: id, data: { portal } });
  });
  revalidatePath('/super-admin', 'layout');
}

/** Declines a portal a company asked for: the request is removed. Portals already on are untouched. */
export async function declineCompanyPortalAction(companyId: string, portal: string) {
  const userId = await requireSuperAdmin();
  const id = z.uuid().parse(companyId);
  const db = await getDb();
  await withTenant(db, { companyId: id, userId }, async (tx) => {
    await tx
      .delete(companyPortals)
      .where(and(eq(companyPortals.companyId, id), eq(companyPortals.portal, portal), eq(companyPortals.enabled, false)));
    await audit(tx, { companyId: id, actorId: null, action: 'portal.decline', entity: 'company_portals', entityId: id, data: { portal } });
  });
  revalidatePath('/super-admin', 'layout');
}

/** Approves one person waiting to join a company. */
export async function approveMemberAction(companyId: string, membershipId: string) {
  const userId = await requireSuperAdmin();
  const db = await getDb();
  const id = z.uuid().parse(membershipId);
  await withTenant(db, { companyId, userId }, async (tx) => {
    await tx
      .update(memberships)
      .set({ status: 'active' })
      .where(and(eq(memberships.id, id), eq(memberships.companyId, companyId), eq(memberships.status, 'pending')));
    await activateRequestedPortals(tx, [id]);
    await audit(tx, { companyId, actorId: null, action: 'membership.approve', entity: 'memberships', entityId: id });
  });
  revalidatePath('/super-admin', 'layout');
}

/** Gives or removes one person's access to one portal (approves a requested portal too). */
export async function setMemberPortalAction(companyId: string, membershipId: string, portal: string, on: boolean) {
  const userId = await requireSuperAdmin();
  const id = z.uuid().parse(membershipId);
  if (!portalModules[portal]) throw new Error('Unknown portal');
  const db = await getDb();
  await withTenant(db, { companyId, userId }, async (tx) => {
    await setMemberPortal(tx, companyId, id, portal, on ? 'active' : 'off');
    await audit(tx, { companyId, actorId: null, action: on ? 'member_portal.on' : 'member_portal.off', entity: 'memberships', entityId: id, data: { portal } });
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
