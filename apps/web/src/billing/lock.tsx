import Link from 'next/link';
import { query } from '@orbit/core/next';
import type { SessionContext } from '@orbit/core';
import { SignOutButton } from '@orbit/ui';
import { LockSwitch } from './LockSwitch';
import { billingState, missing, type BillingStatus } from './state';

/** Pages that stay open when the subscription period has ended: paying, and the terms. */
export const OPEN_WHEN_ENDED = ['/manage/company/billing', '/manage/company/legal'];

/** Why the company is locked, or null while its free period or plan is running. */
export async function subscriptionLock(): Promise<{ status: BillingStatus; endedOn: string | null; showPlans: boolean } | null> {
  try {
    const s = await query((tx, ctx) => billingState(tx, ctx));
    if (s.usable) return null;
    return { status: s.status, endedOn: s.status === 'cancelled' ? s.currentPeriodEnd : s.trialEndsAt, showPlans: s.showPlans };
  } catch (err) {
    // Before the billing migrations every company is on the free trial.
    if (missing(err)) return null;
    throw err;
  }
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null);

/**
 * Wraps a layout's pages. While the subscription runs it is invisible. Once the free period or
 * the plan has ended, every page except Plan and billing shows the "period ended" pop-up instead.
 */
export async function SubscriptionGate({ role, children }: { role: SessionContext['role']; children: React.ReactNode }) {
  const lock = await subscriptionLock();
  if (!lock) return <>{children}</>;
  const admin = role === 'company_admin';
  const trial = lock.status === 'trial_ended' || lock.status === 'pending_payment';
  const on = fmt(lock.endedOn);
  return (
    <LockSwitch
      open={OPEN_WHEN_ENDED}
      locked={
        <div className="o-lock" role="alertdialog" aria-modal="true" aria-labelledby="o-lock-title" aria-describedby="o-lock-text">
          <div className="o-lock-card">
            <div className="o-lock-mark" aria-hidden>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
                <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
              </svg>
            </div>
            <h1 id="o-lock-title">{trial ? 'Your free subscription period has ended' : 'Your subscription period has ended'}</h1>
            <p id="o-lock-text">
              {trial ? `The free period for your company ended${on ? ` on ${on}` : ''}.` : `Your Orbit plan ended${on ? ` on ${on}` : ''}.`} Your data is safe and nothing has been deleted.{' '}
              {admin
                ? lock.showPlans
                  ? 'Choose a plan to open every portal again, or ask Orbit to extend your free period.'
                  : 'Contact the Orbit team to arrange your plan or to extend your free period.'
                : 'Ask your company admin to renew it. Everything opens again as soon as the plan is active.'}
            </p>
            <div className="o-lock-actions">
              {admin && (
                <Link className="o-btn primary" href="/manage/company/billing">
                  {lock.showPlans ? 'Choose a plan' : 'Plan and billing'}
                </Link>
              )}
              <SignOutButton />
            </div>
          </div>
        </div>
      }
    >
      {children}
    </LockSwitch>
  );
}
