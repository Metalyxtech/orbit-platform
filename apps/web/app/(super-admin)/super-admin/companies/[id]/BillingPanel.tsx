import Link from 'next/link';
import { eventCurrency, type CompanyBillingSummary } from '@/billing/admin';
import { money } from '@/billing/plans';
import { extendFreePeriodAction, markPaymentsSeenAction, setCompanyBillingAction } from '../../billing-actions';
import { EVENT_LABEL, STATUS_LABEL } from '../../billing-labels';
import { fmtDate } from '../../data';

/** Company page > Billing: what the client pays in, whether plans are released, and their payments. */
export function BillingPanel({ companyId, b }: { companyId: string; b: CompanyBillingSummary }) {
  const st = STATUS_LABEL[b.state.status];
  const cur = b.settings.currency;
  // Free period controls: while it runs, after it has ended, or after an unpaid checkout.
  const free = b.state.status === 'trial' || b.state.status === 'trial_ended' || b.state.status === 'pending_payment';
  return (
    <div className="o-panel">
      <div className="o-panel-head">
        <h2>Billing</h2>
        <span className={`o-chip ${st.tone}`}>{st.label}</span>
        {b.newCount > 0 && <span className="o-chip ok">New payment</span>}
      </div>
      <p style={{ fontSize: 13, margin: '0 0 10px' }}>
        {b.state.planName ? (
          <>
            <strong>{b.state.planName}</strong>
            {b.price != null && ` · ${money(b.price, cur)} per ${b.per}`}
            {b.state.currentPeriodEnd && ` · ${b.state.cancelAtPeriodEnd ? 'ends' : 'renews'} ${fmtDate(new Date(b.state.currentPeriodEnd))}`}
          </>
        ) : b.state.status === 'trial' ? (
          `Free trial, ${b.state.trialDaysLeft} days left (until ${fmtDate(new Date(b.state.trialEndsAt))})`
        ) : (
          'No plan yet'
        )}
      </p>
      {free && (
        <div className={`o-banner ${b.state.status === 'trial' ? 'info' : 'bad'}`} style={{ marginBottom: 12 }}>
          <strong>{b.state.status === 'trial' ? `Free period: ${b.state.trialDaysLeft} ${b.state.trialDaysLeft === 1 ? 'day' : 'days'} left` : 'Free period ended'}</strong>
          <div style={{ fontSize: 13, margin: '2px 0 10px' }}>
            {b.state.status === 'trial' ? 'Ends' : 'Ended'} {fmtDate(new Date(b.state.trialEndsAt))}.{' '}
            {b.state.status === 'trial' ? 'After that every page shows "subscription period ended" until a plan is active.' : 'The company sees "subscription period ended" on every page. Extending opens it again at once.'}
          </div>
          <div className="o-row" style={{ flexWrap: 'wrap' }}>
            {[7, 14, 30].map((n) => (
              <form key={n} action={extendFreePeriodAction.bind(null, companyId, n)}>
                <button className="o-btn small" type="submit">
                  + {n} days
                </button>
              </form>
            ))}
            <form action={extendFreePeriodAction.bind(null, companyId)} className="o-row" style={{ gap: 6 }}>
              <input className="o-input" type="number" name="days" min={1} max={365} placeholder="Days" aria-label="Days to add" style={{ width: 84 }} required />
              <button className="o-btn small primary" type="submit">
                Extend
              </button>
            </form>
          </div>
        </div>
      )}
      <form action={setCompanyBillingAction.bind(null, companyId)} className="o-stack" style={{ gap: 10 }}>
        <label className="o-field">
          Client pays in
          <select className="o-select" name="currency" defaultValue={cur}>
            <option value="INR">Indian rupees (₹), India</option>
            <option value="USD">US dollars ($), outside India</option>
          </select>
        </label>
        <label className="o-field">
          Subscription plans
          <select className="o-select" name="showPlans" defaultValue={b.settings.showPlans ? 'show' : 'hide'}>
            <option value="show">Released: the admin sees plans and pays online</option>
            <option value="hide">Hidden: Orbit arranges the plan</option>
          </select>
        </label>
        <label className="o-field">
          Free period length (days from sign-up)
          <input className="o-input" type="number" name="trialDays" min={0} max={3650} defaultValue={b.settings.trialDays} />
        </label>
        <button className="o-btn small primary" type="submit" style={{ alignSelf: 'flex-start' }}>
          Save billing
        </button>
      </form>
      {b.events.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, margin: '14px 0 6px' }}>Recent payments and events</h3>
          <ul className="o-stack" style={{ gap: 4, listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
            {b.events.slice(0, 6).map((e) => (
              <li key={e.id} className="o-row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span>
                  {fmtDate(e.createdAt)} · {EVENT_LABEL[e.type] ?? e.type}
                </span>
                <span className="faint">{e.amount ? money(e.amount / 100, eventCurrency(e, cur)) : ''}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="o-row" style={{ gap: 8, marginTop: 10 }}>
        {b.newCount > 0 && (
          <form action={markPaymentsSeenAction.bind(null, [companyId])}>
            <button className="o-btn small" type="submit">
              Mark as seen
            </button>
          </form>
        )}
        <Link className="o-btn small" href="/super-admin/subscriptions">
          All subscriptions
        </Link>
      </div>
    </div>
  );
}
