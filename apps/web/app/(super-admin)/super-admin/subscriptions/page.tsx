import Link from 'next/link';
import { KpiStrip } from '@orbit/ui';
import { eventCurrency } from '@/billing/admin';
import { cycleOf, money } from '@/billing/plans';
import { customCycleLabel } from '@/custom/plan';
import { markPaymentsSeenAction, setPlansShownAction } from '../billing-actions';
import { loadSubscriptions } from '../billing-data';
import { EVENT_LABEL, STATUS_LABEL } from '../billing-labels';
import { fmtDate, requireSuperAdminPage } from '../data';

export const dynamic = 'force-dynamic';

/** Super Admin > Subscriptions: every company's plan and payments; new confirmations are flagged. */
export default async function Subscriptions() {
  const me = await requireSuperAdminPage();
  const rows = await loadSubscriptions(me.userId);
  const fresh = rows.filter((r) => r.newCount > 0);
  const paid = rows.filter((r) => r.state.status === 'active' || r.state.status === 'past_due');
  const monthly = (cur: 'INR' | 'USD') =>
    paid.filter((r) => r.settings.currency === cur && r.price != null && r.state.cycle).reduce((n, r) => n + r.price! / cycleOf(r.state.cycle!).months, 0);

  return (
    <>
      <header className="o-top">
        <strong style={{ flex: 1 }}>Subscriptions</strong>
        {fresh.length > 0 && (
          <form action={markPaymentsSeenAction.bind(null, fresh.map((r) => r.company.id))}>
            <button className="o-btn small" type="submit">
              Mark all as seen
            </button>
          </form>
        )}
      </header>
      <div className="o-page">
        {fresh.length > 0 && (
          <div className="o-banner ok">
            New subscription confirmation{fresh.length > 1 ? 's' : ''} from {fresh.map((r) => r.company.name).join(', ')}.
          </div>
        )}
        <KpiStrip
          items={[
            { value: String(paid.length), label: 'Paying companies' },
            { value: String(rows.filter((r) => r.state.status === 'trial').length), label: 'On free trial' },
            { value: money(Math.round(monthly('INR')), 'INR'), label: 'Monthly revenue (India)' },
            { value: money(Math.round(monthly('USD')), 'USD'), label: 'Monthly revenue (abroad)' },
          ]}
        />
        <div className="o-panel flush">
          <div className="o-scroll">
            <table className="o-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Pays in</th>
                  <th>Plans</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th className="num">Amount</th>
                  <th>Renews / ends</th>
                  <th>Last confirmation</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = STATUS_LABEL[r.state.status];
                  const cur = r.settings.currency;
                  const last = r.lastPayment;
                  return (
                    <tr key={r.company.id}>
                      <td>
                        <Link href={`/super-admin/companies/${r.company.id}`}>
                          <strong>{r.company.name}</strong>
                        </Link>
                        {r.newCount > 0 && (
                          <span className="o-chip ok" style={{ marginLeft: 6 }}>
                            New
                          </span>
                        )}
                      </td>
                      <td>{cur === 'USD' ? 'US dollars ($)' : 'Rupees (₹)'}</td>
                      <td>
                        <form action={setPlansShownAction.bind(null, r.company.id, !r.settings.showPlans)} className="o-row" style={{ gap: 6 }}>
                          <span className={`o-chip ${r.settings.showPlans ? 'ok' : ''}`}>{r.settings.showPlans ? 'Released' : 'Hidden'}</span>
                          <button className="o-btn small" type="submit">
                            {r.settings.showPlans ? 'Hide' : 'Release'}
                          </button>
                        </form>
                      </td>
                      <td>
                        <span className={`o-chip ${st.tone}`}>{st.label}</span>
                        {r.state.status === 'trial' && <div className="faint" style={{ fontSize: 11 }}>{r.state.trialDaysLeft} days left</div>}
                      </td>
                      <td>
                        {r.state.planName ?? '-'}
                        {r.state.cycle && <div className="faint" style={{ fontSize: 11 }}>{r.state.plan === 'custom' ? customCycleLabel(r.state.cycle) : cycleOf(r.state.cycle).label}</div>}
                      </td>
                      <td className="num">{r.price != null ? `${money(r.price, cur)} / ${r.per}` : '-'}</td>
                      <td>{r.state.currentPeriodEnd ? `${r.state.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${fmtDate(new Date(r.state.currentPeriodEnd))}` : '-'}</td>
                      <td>
                        {last ? (
                          <>
                            {EVENT_LABEL[last.type] ?? last.type}
                            {last.amount ? ` · ${money(last.amount / 100, eventCurrency(last, cur))}` : ''}
                            <div className="faint" style={{ fontSize: 11 }}>{fmtDate(last.createdAt)}</div>
                          </>
                        ) : (
                          <span className="faint">None yet</span>
                        )}
                      </td>
                      <td>
                        {r.newCount > 0 && (
                          <form action={markPaymentsSeenAction.bind(null, [r.company.id])}>
                            <button className="o-btn small" type="submit">
                              Seen
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <div className="o-empty">No companies yet.</div>}
        </div>
      </div>
    </>
  );
}
