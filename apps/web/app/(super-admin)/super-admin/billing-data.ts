import { getDb } from '@orbit/core/next';
import { withTenant } from '@orbit/db';
import { companyBillingSummary, newConfirmations } from '@/billing/admin';
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

/** How many companies have a payment confirmation Super Admin has not seen yet (menu badge). */
export async function countNewPayments(superUserId: string) {
  const db = await getDb();
  let n = 0;
  for (const c of (await loadCompanies()).filter((x) => x.status === 'active')) {
    if ((await withTenant(db, { companyId: c.id, userId: superUserId }, (tx) => newConfirmations(tx, c.id))) > 0) n++;
  }
  return n;
}

/** One company's billing for its Super Admin page. */
export async function loadCompanyBilling(companyId: string, superUserId: string) {
  const db = await getDb();
  return withTenant(db, { companyId, userId: superUserId }, (tx) => companyBillingSummary(tx, companyId));
}
