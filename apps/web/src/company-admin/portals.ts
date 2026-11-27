import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit, companyIndustry, type ActionContext, type SessionContext } from '@orbit/core';
import { companyPortals, type Tx } from '@orbit/db';
import { assertWithinPlan } from '../billing/state';
import { INDUSTRY_PORTALS } from '../industry-portals';
import { portalModules } from '../portals';

const requireAdmin = (ctx: SessionContext) => {
  if (ctx.role !== 'company_admin') throw new Error('Only the company admin can manage portals');
};

export type CompanyPortalState = 'on' | 'requested' | 'none';

/** Every SteelConnect360 portal and where this company stands with it. */
export async function companyPortalList(tx: Tx, ctx: SessionContext) {
  requireAdmin(ctx);
  const rows = await tx.select({ portal: companyPortals.portal, enabled: companyPortals.enabled }).from(companyPortals).where(eq(companyPortals.companyId, ctx.companyId));
  // The company type's own portals, plus any portal already switched on (a custom portal only once
  // SteelConnect360 has switched it on).
  const own = INDUSTRY_PORTALS[await companyIndustry(tx, ctx.companyId)];
  const shown = Object.values(portalModules).filter((m) => rows.some((r) => r.portal === m.manifest.id && r.enabled) || (!m.manifest.custom && own.includes(m.manifest.id)));
  return shown.map((m) => {
    const row = rows.find((r) => r.portal === m.manifest.id);
    return {
      id: m.manifest.id,
      name: m.manifest.name,
      roles: m.manifest.portalRoles?.map((r) => r.label) ?? [],
      pages: m.manifest.nav.filter((n) => n.section === 'main').map((n) => n.label),
      state: (row ? (row.enabled ? 'on' : 'requested') : 'none') as CompanyPortalState,
    };
  });
}

const portalInput = z.object({ portal: z.string().refine((p) => !!portalModules[p] && !portalModules[p].manifest.custom, 'Unknown portal') });

/** Asks SteelConnect360 to add a portal for the company. It switches on when Super Admin approves. */
export async function requestCompanyPortal(tx: Tx, ctx: ActionContext, raw: { portal: string }) {
  requireAdmin(ctx);
  const { portal } = portalInput.parse(raw);
  if (!INDUSTRY_PORTALS[await companyIndustry(tx, ctx.companyId)].includes(portal)) throw new Error('This portal is not available for your type of company');
  await assertWithinPlan(tx, ctx, 'portal', portal);
  await tx.insert(companyPortals).values({ companyId: ctx.companyId, portal, enabled: false }).onConflictDoNothing();
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'company_portal.request', entity: 'company_portals', entityId: ctx.companyId, data: { portal }, requestId: ctx.requestId });
  return { ok: true as const };
}

/** Withdraws a request that SteelConnect360 has not approved yet. */
export async function cancelCompanyPortal(tx: Tx, ctx: ActionContext, raw: { portal: string }) {
  requireAdmin(ctx);
  const { portal } = portalInput.parse(raw);
  await tx.delete(companyPortals).where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.portal, portal), eq(companyPortals.enabled, false)));
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'company_portal.cancel', entity: 'company_portals', entityId: ctx.companyId, data: { portal }, requestId: ctx.requestId });
  return { ok: true as const };
}
