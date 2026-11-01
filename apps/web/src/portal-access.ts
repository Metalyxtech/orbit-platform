import { and, eq } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { readMemberPortals } from '@orbit/core';
import { companyPortals, type Tx } from '@orbit/db';
import { portalModules } from './portals';

/**
 * Portals this person may open: switched on for the company and, unless they are an admin or
 * management, active for them. People without portal rows (joined earlier) get every portal on.
 */
export async function accessiblePortals(tx: Tx, ctx: SessionContext): Promise<string[]> {
  const on = await tx
    .select({ portal: companyPortals.portal })
    .from(companyPortals)
    .where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.enabled, true)));
  const enabled = on.map((r) => r.portal).filter((p) => portalModules[p]);
  if (ctx.role === 'company_admin' || ctx.role === 'management') return enabled;
  const mine = await readMemberPortals(tx, [ctx.membershipId]);
  if (mine.length === 0) return enabled;
  return enabled.filter((p) => mine.some((m) => m.portal === p && m.status === 'active'));
}
