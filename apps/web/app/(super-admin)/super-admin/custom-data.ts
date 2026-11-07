import { getDb } from '@orbit/core/next';
import { withTenant } from '@orbit/db';
import { getCustomPlan } from '@/custom/plan';
import { subscriptionSnapshot } from '@/custom/quotes';
import { companyRequests } from '@/custom/requests';
import { loadCompanies } from './data';

/** Every custom requirement across companies, newest first, for Super Admin > Custom work. */
export async function allCustomRequests(superUserId: string) {
  const db = await getDb();
  const out = [];
  for (const c of await loadCompanies()) {
    const rows = await withTenant(db, { companyId: c.id, userId: superUserId }, (tx) => companyRequests(tx, c.id));
    out.push(...rows.map((r) => ({ ...r, company: c.name })));
  }
  return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** One company's custom deal and requests, for its company page. */
export async function companyCustomWork(companyId: string, superUserId: string) {
  const db = await getDb();
  return withTenant(db, { companyId, userId: superUserId }, async (tx) => ({
    plan: await getCustomPlan(tx, companyId),
    requests: await companyRequests(tx, companyId),
    subscription: await subscriptionSnapshot(tx, companyId),
  }));
}
