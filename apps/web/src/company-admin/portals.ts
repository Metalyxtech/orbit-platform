import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { companyPortals, type Tx } from '@orbit/db';
import { portalModules } from '../portals';

const requireAdmin = (ctx: SessionContext) => {
  if (ctx.role !== 'company_admin') throw new Error('Only the company admin can manage portals');
};

export type CompanyPortalState = 'on' | 'requested' | 'none';

/** Every Orbit portal and where this company stands with it. */
export async function companyPortalList(tx: Tx, ctx: SessionContext) {
  requireAdmin(ctx);
  const rows = await tx.select({ portal: companyPortals.portal, enabled: companyPortals.enabled }).from(companyPortals).where(eq(companyPortals.companyId, ctx.companyId));
  return Object.values(portalModules).map((m) => {
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

const portalInput = z.object({ portal: z.string().refine((p) => !!portalModules[p], 'Unknown portal') });

/** Asks Orbit to add a portal for the company. It switches on when Super Admin approves. */
export async function requestCompanyPortal(tx: Tx, ctx: ActionContext, raw: { portal: string }) {
  requireAdmin(ctx);
  const { portal } = portalInput.parse(raw);
  await tx.insert(companyPortals).values({ companyId: ctx.companyId, portal, enabled: false }).onConflictDoNothing();
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'company_portal.request', entity: 'company_portals', entityId: ctx.companyId, data: { portal }, requestId: ctx.requestId });
  return { ok: true as const };
}

/** Withdraws a request that Orbit has not approved yet. */
export async function cancelCompanyPortal(tx: Tx, ctx: ActionContext, raw: { portal: string }) {
  requireAdmin(ctx);
  const { portal } = portalInput.parse(raw);
  await tx.delete(companyPortals).where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.portal, portal), eq(companyPortals.enabled, false)));
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'company_portal.cancel', entity: 'company_portals', entityId: ctx.companyId, data: { portal }, requestId: ctx.requestId });
  return { ok: true as const };
}
