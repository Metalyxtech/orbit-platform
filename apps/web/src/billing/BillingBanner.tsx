import Link from 'next/link';
import type { SessionContext } from '@orbit/core';
import { query } from '@orbit/core/next';
import { billingState } from './state';

/**
 * A strip above every page when the plan needs attention: trial ending soon, trial over, payment due.
 * Company admins get a link to Plan and billing; others are told to ask their admin.
 */
export async function BillingBanner({ role }: { role: SessionContext['role'] }) {
  let s;
  try {
    s = await query((tx, ctx) => billingState(tx, ctx));
  } catch {
    return null;
  }
  const admin = role === 'company_admin';
  let text: string | null = null;
  let tone = 'info';
  if (s.status === 'trial' && s.trialDaysLeft <= 7 && admin) text = `Your free trial ends in ${s.trialDaysLeft} ${s.trialDaysLeft === 1 ? 'day' : 'days'}. Choose a plan to keep everything running.`;
  else if (s.status === 'trial_ended' || s.status === 'cancelled' || s.status === 'pending_payment') {
    text = admin ? 'Your Orbit plan is not active. Choose a plan to keep adding people and portals.' : 'Your company’s Orbit plan is not active. Ask your company admin to renew it.';
    tone = 'bad';
  } else if (s.status === 'past_due' && admin) {
    text = 'Razorpay could not take the last payment and is retrying. Check your payment method.';
    tone = 'bad';
  }
  if (!text) return null;
  return (
    <div className={`o-banner ${tone}`} style={{ borderRadius: 0, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <span>{text}</span>
      {admin && (
        <Link className="o-btn small primary" href="/manage/company/billing">
          Plan and billing
        </Link>
      )}
    </div>
  );
}
