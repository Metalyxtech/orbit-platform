import { redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { billingHistory, billingState } from '@/billing/state';
import { BillingClient } from './BillingClient';

export const dynamic = 'force-dynamic';

/** Company admin > Plan and billing: subscription with Razorpay. */
export default async function Billing() {
  const s = await getSession();
  if (s.state !== 'ok' || s.ctx.role !== 'company_admin') redirect('/manage');
  const d = await query(async (tx, ctx) => ({ state: await billingState(tx, ctx), history: await billingHistory(tx, ctx) }));
  return (
    <>
      <header className="o-top">
        <strong>Plan and billing</strong>
      </header>
      <BillingClient
        state={d.state}
        company={s.ctx.companyName}
        history={d.history.map((h) => ({ id: h.id, type: h.type, amount: h.amount, currency: ((h.data ?? {}) as { currency?: string }).currency ?? null, ref: h.razorpayId, at: h.createdAt.toISOString() }))}
      />
    </>
  );
}
