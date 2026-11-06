import Link from 'next/link';
import { eventCurrency, type CompanyBillingSummary } from '@/billing/admin';
import { money } from '@/billing/plans';
import { markPaymentsSeenAction, setCompanyBillingAction } from '../../billing-actions';
import { EVENT_LABEL, STATUS_LABEL } from '../../billing-labels';
import { fmtDate } from '../../data';

/** Company page > Billing: what the client pays in, whether plans are released, and their payments. */
export function BillingPanel({ companyId, b }: { companyId: string; b: CompanyBillingSummary }) {
  const st = STATUS_LABEL[b.state.status];
  const cur = b.settings.currency;
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
          Free trial (days from sign-up)
          <input className="o-input" type="number" name="trialDays" min={0} max={90} defaultValue={b.settings.trialDays} />
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
