import { and, desc, eq, inArray } from 'drizzle-orm';
import { audit, type ActionContext } from '@orbit/core';
import { billingEvents, companyPortals, type Tx } from '@orbit/db';
import { isCustomPortal } from '../portals';
import { planOf, portalName } from './plans';

// Fits the company's portals to the plan it just paid for.
// A smaller plan (e.g. Timesheet only while Purchase is on) pauses the other portal; its data is kept.
// A later plan that includes a paused portal switches it back on.

const PAUSED = 'plan.portals_paused';

export async function fitPortalsToPlan(tx: Tx, ctx: ActionContext, planId: string) {
  const plan = planOf(planId);
  if (!plan) return { paused: [] as string[], resumed: [] as string[] };
  const rows = await tx.select({ portal: companyPortals.portal, enabled: companyPortals.enabled }).from(companyPortals).where(eq(companyPortals.companyId, ctx.companyId));
  // Custom portals belong to the custom deal, never to a standard plan: never paused here.
  const paused = rows.filter((r) => r.enabled && !plan.portals.includes(r.portal) && !isCustomPortal(r.portal)).map((r) => r.portal);
  // Portals billing paused before (not ones Orbit switched off) come back when the new plan includes them.
  const earlier = await tx
    .select({ data: billingEvents.data })
    .from(billingEvents)
    .where(and(eq(billingEvents.companyId, ctx.companyId), eq(billingEvents.type, PAUSED)))
    .orderBy(desc(billingEvents.createdAt))
    .limit(1);
  const wasPaused = ((earlier[0]?.data as { portals?: string[] } | null)?.portals ?? []).filter((p) => !paused.includes(p));
  const resumed = rows.filter((r) => !r.enabled && wasPaused.includes(r.portal) && plan.portals.includes(r.portal)).map((r) => r.portal);

  if (paused.length) {
    await tx.update(companyPortals).set({ enabled: false }).where(and(eq(companyPortals.companyId, ctx.companyId), inArray(companyPortals.portal, paused)));
  }
  if (resumed.length) {
    await tx.update(companyPortals).set({ enabled: true }).where(and(eq(companyPortals.companyId, ctx.companyId), inArray(companyPortals.portal, resumed)));
  }
  if (paused.length || resumed.length) {
    const still = wasPaused.filter((p) => !resumed.includes(p));
    await tx.insert(billingEvents).values({ companyId: ctx.companyId, type: PAUSED, data: { portals: [...paused, ...still], plan: planId } });
    await audit(tx, {
      companyId: ctx.companyId,
      actorId: ctx.membershipId,
      action: 'billing.portals',
      entity: 'company_portals',
      entityId: ctx.companyId,
      data: {
        summary: [
          ...(paused.length ? [`${paused.map(portalName).join(' and ')} paused: not in the ${plan.name} plan`] : []),
          ...(resumed.length ? [`${resumed.map(portalName).join(' and ')} switched back on with the ${plan.name} plan`] : []),
        ],
      },
      requestId: ctx.requestId,
    });
  }
  return { paused, resumed };
}
