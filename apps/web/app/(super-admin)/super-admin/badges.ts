import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { getDb } from '@orbit/core/next';
import { billingEvents, companyBilling, companyPortals, customRequests, memberPortals, memberships, withTenant } from '@orbit/db';
import { CONFIRMATIONS } from '@/billing/admin';
import { portalModules } from '@/portals';
import { loadCompanies } from './data';

/**
 * Menu badges for Super Admin: things waiting for approval, and companies with a payment not seen yet.
 * One small transaction per company (the full Requests page loads the details).
 */
export async function superAdminBadges(superUserId: string) {
  const db = await getDb();
  const all = await loadCompanies();
  const portals = Object.keys(portalModules);
  let requests = all.filter((c) => c.status === 'pending').length;
  let payments = 0;
  let custom = 0;
  for (const c of all.filter((x) => x.status === 'active')) {
    const r = await withTenant(db, { companyId: c.id, userId: superUserId }, async (tx) => {
      const [cp] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(companyPortals)
        .where(and(eq(companyPortals.companyId, c.id), eq(companyPortals.enabled, false), inArray(companyPortals.portal, portals)));
      const [pm] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(memberships)
        .where(and(eq(memberships.companyId, c.id), eq(memberships.status, 'pending')));
      const [mp] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(memberPortals)
        .innerJoin(memberships, eq(memberships.id, memberPortals.membershipId))
        .where(and(eq(memberships.companyId, c.id), eq(memberships.status, 'active'), eq(memberPortals.status, 'requested'), inArray(memberPortals.portal, portals)));
      const [b] = await tx.select({ seenAt: companyBilling.seenAt }).from(companyBilling).where(eq(companyBilling.companyId, c.id));
      const [paid] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(billingEvents)
        .where(and(eq(billingEvents.companyId, c.id), inArray(billingEvents.type, CONFIRMATIONS), b?.seenAt ? gt(billingEvents.createdAt, b.seenAt) : undefined));
      // New custom requirements (skipped until migration 0015 has run).
      let fresh = 0;
      try {
        [{ n: fresh }] = await tx.transaction((sp) =>
          sp.select({ n: sql<number>`count(*)::int` }).from(customRequests).where(and(eq(customRequests.companyId, c.id), eq(customRequests.status, 'new'))),
        );
      } catch (err) {
        if (!/custom_requests/.test(String(err)) && (err as { cause?: { code?: string } })?.cause?.code !== '42P01') throw err;
      }
      return { requests: cp.n + pm.n + mp.n, paid: paid.n, custom: fresh };
    });
    requests += r.requests;
    if (r.paid > 0) payments++;
    custom += r.custom;
  }
  return { requests, payments, custom };
}
