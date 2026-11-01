import { and, eq, inArray } from 'drizzle-orm';
import { companyPortals, memberPortals, type Tx } from '@orbit/db';

export type MemberPortalStatus = 'requested' | 'active' | 'off';
export type MemberPortalRow = { membershipId: string; portal: string; status: MemberPortalStatus };

const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
/** Migration 0005 not run: the member_portals table is missing. */
export const missingTable = (err: unknown) => pgCode(err) === '42P01' || /relation "member_portals" does not exist/.test(String(err));
/** Migration 0006 not run: the status column is missing. */
const missingStatus = (err: unknown) => pgCode(err) === '42703' || /column "status" does not exist/.test(String(err));

/**
 * Portal rows for some memberships. Runs in savepoints so a database without migrations 0005 / 0006
 * reads as "no rows" / "every row active" instead of failing the page.
 */
export async function readMemberPortals(tx: Tx, membershipIds: string[]): Promise<MemberPortalRow[]> {
  if (membershipIds.length === 0) return [];
  const where = inArray(memberPortals.membershipId, membershipIds);
  try {
    return await tx.transaction((sp) =>
      sp.select({ membershipId: memberPortals.membershipId, portal: memberPortals.portal, status: memberPortals.status }).from(memberPortals).where(where),
    );
  } catch (err) {
    if (missingTable(err)) return [];
    if (!missingStatus(err)) throw err;
  }
  const rows = await tx.transaction((sp) =>
    sp.select({ membershipId: memberPortals.membershipId, portal: memberPortals.portal }).from(memberPortals).where(where),
  );
  return rows.map((r) => ({ ...r, status: 'active' as const }));
}

/** Records the portals someone asked for when joining (status requested). */
export async function requestMemberPortals(tx: Tx, companyId: string, membershipId: string, portals: string[]) {
  const values = portals.map((portal) => ({ companyId, membershipId, portal }));
  try {
    await tx.transaction((sp) => sp.insert(memberPortals).values(values.map((v) => ({ ...v, status: 'requested' as const }))).onConflictDoNothing());
    return;
  } catch (err) {
    if (missingTable(err)) return; // before 0005 everyone gets every portal
    if (!missingStatus(err)) throw err;
  }
  // Before 0006 there is no request state: the row simply grants the portal.
  await tx.transaction((sp) => sp.insert(memberPortals).values(values).onConflictDoNothing());
}

/** Activates the portals a person asked for (used when their membership is approved). */
export async function activateRequestedPortals(tx: Tx, membershipIds: string[]) {
  if (membershipIds.length === 0) return;
  try {
    await tx.transaction((sp) =>
      sp
        .update(memberPortals)
        .set({ status: 'active' })
        .where(and(inArray(memberPortals.membershipId, membershipIds), eq(memberPortals.status, 'requested'))),
    );
  } catch (err) {
    if (!missingTable(err) && !missingStatus(err)) throw err;
  }
}

/**
 * Sets one person's access to one portal (or files a request for it). A person without rows had every portal: the first change
 * writes their full list so turning one portal off does not remove the others.
 */
export async function setMemberPortal(tx: Tx, companyId: string, membershipId: string, portal: string, status: MemberPortalStatus) {
  try {
    await tx.transaction(async (sp) => {
      const existing = await sp.select({ portal: memberPortals.portal }).from(memberPortals).where(eq(memberPortals.membershipId, membershipId));
      if (existing.length === 0) {
        const on = await sp
          .select({ portal: companyPortals.portal })
          .from(companyPortals)
          .where(and(eq(companyPortals.companyId, companyId), eq(companyPortals.enabled, true)));
        const others = on.map((r) => r.portal).filter((p) => p !== portal);
        if (others.length) {
          await sp.insert(memberPortals).values(others.map((p) => ({ companyId, membershipId, portal: p, status: 'active' as const })));
        }
      }
      await sp
        .insert(memberPortals)
        .values({ companyId, membershipId, portal, status })
        .onConflictDoUpdate({ target: [memberPortals.membershipId, memberPortals.portal], set: { status } });
    });
  } catch (err) {
    if (missingTable(err) || missingStatus(err)) {
      throw new Error('Run the latest database update (pnpm db:migrate) to manage portals per person.');
    }
    throw err;
  }
}
