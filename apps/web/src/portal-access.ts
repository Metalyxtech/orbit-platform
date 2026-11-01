import { and, eq } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { companyPortals, memberPortals, type Tx } from '@orbit/db';
import { portalModules } from './portals';

/** True when the error is "table does not exist" (migration 0005 not run yet). */
export const missingTable = (err: unknown) => (err as { code?: string })?.code === '42P01' || /member_portals/.test(String((err as Error)?.message));

/**
 * Portals this person may open: switched on for the company and, unless they are an admin or
 * management, among the portals they use. People without portal rows (joined earlier) get all.
 */
export async function accessiblePortals(tx: Tx, ctx: SessionContext): Promise<string[]> {
  const on = await tx
    .select({ portal: companyPortals.portal })
    .from(companyPortals)
    .where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.enabled, true)));
  const enabled = on.map((r) => r.portal).filter((p) => portalModules[p]);
  if (ctx.role === 'company_admin' || ctx.role === 'management') return enabled;
  let mine: string[] = [];
  try {
    // Savepoint: a missing table must not abort the surrounding transaction.
    mine = await tx.transaction(async (sp) =>
      (await sp.select({ portal: memberPortals.portal }).from(memberPortals).where(eq(memberPortals.membershipId, ctx.membershipId))).map((r) => r.portal),
    );
  } catch (err) {
    if (!missingTable(err)) throw err;
  }
  return mine.length ? enabled.filter((p) => mine.includes(p)) : enabled;
}
