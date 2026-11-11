import { eq, inArray } from 'drizzle-orm';
import { audit, portalRoleFor, readPortalRoles, type ActionContext, type SessionContext } from '@orbit/core';
import { memberships, qcEvents, qcInspections, users, type Tx } from '@orbit/db';
import type { QcRole } from '../config';
import { qualityManifest } from '../manifest';

export const PORTAL = 'quality';

const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
/** Migration 0025 not run yet. */
export const notReady = (err: unknown) => pgCode(err) === '42P01' || /relation "qc_\w+" does not exist/.test(String(err));
export const NOT_READY = 'The Quality portal switches on after the latest database update.';

export async function myRole(tx: Tx, ctx: SessionContext): Promise<QcRole> {
  const stored = (await readPortalRoles(tx, PORTAL, [ctx.membershipId])).get(ctx.membershipId);
  return portalRoleFor(qualityManifest, ctx.role, stored) as QcRole;
}
export function requireRole(me: QcRole, ...roles: QcRole[]) {
  if (me !== 'admin' && !roles.includes(me)) throw new Error('Your quality role cannot do this');
}
export const hasRole = (me: QcRole, ...roles: QcRole[]) => me === 'admin' || roles.includes(me);

export async function peopleById(tx: Tx, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, string>();
  const rows = await tx.select({ id: memberships.id, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(inArray(memberships.id, list));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function logEvent(tx: Tx, ctx: ActionContext, inspectionId: string, text: string, action?: string) {
  await tx.insert(qcEvents).values({ companyId: ctx.companyId, inspectionId, text, byId: ctx.membershipId });
  if (action) await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action, entity: 'qc_inspections', entityId: inspectionId, data: { summary: [text] }, requestId: ctx.requestId });
}

export async function lockInspection(tx: Tx, ctx: SessionContext, id: string) {
  const [r] = await tx.select().from(qcInspections).where(eq(qcInspections.id, id)).for('update');
  if (!r || r.companyId !== ctx.companyId) throw new Error('Inspection not found');
  return r;
}
