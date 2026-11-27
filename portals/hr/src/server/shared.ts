import { and, asc, eq } from 'drizzle-orm';
import { portalRoleFor, readPortalRoles, type SessionContext } from '@orbit/core';
import { memberships, users, type Tx } from '@orbit/db';
import type { HrRole } from '../config';
import { hrManifest } from '../manifest';

export const PORTAL = 'hr';

const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
/** Migration 0036 not run yet. */
export const notReady = (err: unknown) => pgCode(err) === '42P01' || /relation "hr_\w+" does not exist/.test(String(err));
export const NOT_READY = 'The HR portal switches on after the latest database update.';

export async function myRole(tx: Tx, ctx: SessionContext): Promise<HrRole> {
  const stored = (await readPortalRoles(tx, PORTAL, [ctx.membershipId])).get(ctx.membershipId);
  return portalRoleFor(hrManifest, ctx.role, stored) as HrRole;
}
/** HR officers and HR admins manage records, leave types and everyone's leave. */
export const isHrStaff = (me: HrRole) => me === 'hr' || me === 'admin';
export function requireHrStaff(me: HrRole) {
  if (!isHrStaff(me)) throw new Error('Only HR can do this');
}

export interface Person {
  membershipId: string;
  name: string;
  email: string;
  title: string | null;
  role: string;
  supervisorId: string | null;
}

/** Everyone active in the company. */
export async function activePeople(tx: Tx, ctx: SessionContext): Promise<Person[]> {
  return tx
    .select({ membershipId: memberships.id, name: users.name, email: users.email, title: memberships.title, role: memberships.role, supervisorId: memberships.supervisorId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.status, 'active')))
    .orderBy(asc(users.name));
}

/**
 * People whose leave and attendance I see: HR staff and management see everyone, a supervisor
 * sees the people they supervise (and themselves), everyone else only themselves.
 */
export async function visiblePeople(tx: Tx, ctx: SessionContext) {
  const me = await myRole(tx, ctx);
  const all = await activePeople(tx, ctx);
  if (isHrStaff(me) || ctx.role === 'management') return { me, people: all, everyone: true };
  return { me, people: all.filter((p) => p.membershipId === ctx.membershipId || p.supervisorId === ctx.membershipId), everyone: false };
}
