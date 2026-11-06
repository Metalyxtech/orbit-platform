'use server';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { activateRequestedPortals, audit, Effects, newEvent, setMemberPortal, uuidv7 } from '@orbit/core';
import { getDb } from '@orbit/core/next';
import { companies, companyPortals, memberships, withTenant } from '@orbit/db';
import { portalModules } from '@/portals';
import { confirmed, removeMembership, REMOVE_WORD } from './remove-member';
import { requireSuperAdmin, setPortal } from './guard';
import { timesheetManifest } from '@orbit/portal-timesheet/manifest';

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

/**
 * Removes a person from a company after the Super Admin typed the confirmation word. Returns a
 * result instead of throwing so the dialog can show what happened.
 */
export async function removeMemberAction(companyId: string, membershipId: string, typed: string) {
  const userId = await requireSuperAdmin();
  if (!confirmed(typed)) return { ok: false as const, error: `Type ${REMOVE_WORD} to confirm.` };
  const id = z.uuid().parse(membershipId);
  const db = await getDb();
  try {
    const summary = await withTenant(db, { companyId, userId }, async (tx) => {
      const result = await removeMembership(tx, companyId, id);
      await audit(tx, { companyId, actorId: null, action: 'membership.remove', entity: 'memberships', entityId: id, data: result });
      return result;
    });
    // No revalidatePath here: the dialog shows the result first and refreshes the list when closed.
    return { ok: true as const, summary };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error && !('code' in err) ? err.message : "Couldn't remove this person. Try again." };
  }
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
