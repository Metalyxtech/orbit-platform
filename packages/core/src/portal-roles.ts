import { and, eq, inArray } from 'drizzle-orm';
import { portalRoles, type Tx } from '@orbit/db';

const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
/** Migration 0010 not run: the portal_roles table is missing. */
const missingTable = (err: unknown) => pgCode(err) === '42P01' || /relation "portal_roles" does not exist/.test(String(err));

/** membershipId -> stored role for one portal. Empty before migration 0010. */
export async function readPortalRoles(tx: Tx, portal: string, membershipIds: string[]): Promise<Map<string, string>> {
  if (membershipIds.length === 0) return new Map();
  try {
    const rows = await tx.transaction((sp) =>
      sp
        .select({ membershipId: portalRoles.membershipId, role: portalRoles.role })
        .from(portalRoles)
        .where(and(eq(portalRoles.portal, portal), inArray(portalRoles.membershipId, membershipIds))),
    );
    return new Map(rows.map((r) => [r.membershipId, r.role]));
  } catch (err) {
    if (missingTable(err)) return new Map();
    throw err;
  }
}

/** Saves a person's role in a portal. Returns false before migration 0010. */
export async function writePortalRole(tx: Tx, v: { companyId: string; membershipId: string; portal: string; role: string }): Promise<boolean> {
  try {
    await tx.transaction((sp) =>
      sp
        .insert(portalRoles)
        .values(v)
        .onConflictDoUpdate({ target: [portalRoles.membershipId, portalRoles.portal], set: { role: v.role, updatedAt: new Date() } }),
    );
    return true;
  } catch (err) {
    if (missingTable(err)) return false;
    throw err;
  }
}
