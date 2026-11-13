import { getDb } from '@orbit/core/next';
import { withTenant } from '@orbit/db';
import { companyBillingSummary } from '@/billing/admin';
import { loadCompanies } from './data';

/** Every company's subscription for Super Admin > Subscriptions, newest confirmations first. */
export async function loadSubscriptions(superUserId: string) {
  const db = await getDb();
  const all = (await loadCompanies()).filter((c) => c.status !== 'pending');
  const rows = [];
  for (const c of all) {
    const summary = await withTenant(db, { companyId: c.id, userId: superUserId }, (tx) => companyBillingSummary(tx, c.id));
    rows.push({ company: c, ...summary });
  }
  return rows.sort((a, b) => b.newCount - a.newCount || (b.lastPayment?.createdAt.getTime() ?? 0) - (a.lastPayment?.createdAt.getTime() ?? 0) || a.company.name.localeCompare(b.company.name));
}
export type SubscriptionRow = Awaited<ReturnType<typeof loadSubscriptions>>[number];

/** One company's billing for its Super Admin page. */
export async function loadCompanyBilling(companyId: string, superUserId: string) {
  const db = await getDb();
  return withTenant(db, { companyId, userId: superUserId }, (tx) => companyBillingSummary(tx, companyId));
}
