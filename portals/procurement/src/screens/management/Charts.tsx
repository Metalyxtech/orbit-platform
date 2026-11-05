import { query } from '@orbit/core/next';
import { ColumnChart, CompareKpis, PieChart, StackedBarChart } from '@orbit/ui';
import { dashboard, notReady } from '../../server';
import { fmtK } from '../ui';

/** Purchase charts for the GM overview and the purchase manager's dashboard. */
export async function PurchaseCharts() {
  let d;
  try {
    d = await query((tx, ctx) => dashboard.overviewCharts(tx, ctx));
  } catch (err) {
    if (notReady(err)) return <p className="faint">Purchase switches on after the latest database update.</p>;
    throw err;
  }
  const cur = d.currency;
  const money = (v: number) => fmtK(cur, v);
  return (
    <div className="o-stack" style={{ gap: 16 }}>
      <CompareKpis
        items={[
          { label: 'Ordered this month', value: money(d.now.orderedValue), now: d.now.orderedValue, before: d.before.orderedValue, note: `${d.now.orders} ${d.now.orders === 1 ? 'PO' : 'POs'}` },
          { label: 'Requisitions raised', value: String(d.now.raised), now: d.now.raised, before: d.before.raised },
          { label: 'Requests closed', value: String(d.now.closed), now: d.now.closed, before: d.before.closed },
          { label: 'Days from request to PO', value: d.now.daysToPo ? `${d.now.daysToPo} d` : '-', now: d.now.daysToPo, before: d.now.orders && d.before.orders ? d.before.daysToPo : null, goodWhen: 'down', note: d.now.orders ? 'Average this month' : 'No POs this month' },
        ]}
      />
      <div className="o-chart-grid">
        <div className="o-panel">
          <h2>Requested vs ordered by month</h2>
          <ColumnChart
            format={money}
            series={[
              { name: 'Requested (estimate)', color: '#9aa3ab' },
              { name: 'Ordered (POs)', color: '#2f5d8a' },
            ]}
            points={d.months.map((m) => ({ label: m.label, values: [m.requested, m.orderedValue] }))}
          />
          <p className="o-chart-note">Last 6 months. Requested is by the month the requisition was raised.</p>
        </div>
        <div className="o-panel">
          <h2>Requests raised vs closed</h2>
          <ColumnChart
            series={[
              { name: 'Raised', color: '#e07b39' },
              { name: 'Closed', color: '#3a9a6b' },
            ]}
            points={d.months.map((m) => ({ label: m.label, values: [m.raised, m.closed] }))}
          />
        </div>
        <div className="o-panel">
          <h2>Spend by supplier</h2>
          <PieChart unit={cur} slices={d.bySupplier.map((s) => ({ label: s.label, value: s.value }))} />
        </div>
        <div className="o-panel">
          <h2>Spend by project</h2>
          <StackedBarChart unit={cur} series={[{ name: 'Ordered', color: '#2f5d8a' }]} rows={d.byProject.map((p) => ({ label: p.label, parts: [p.value] }))} />
        </div>
        <div className="o-panel">
          <h2>Open requests by stage</h2>
          <StackedBarChart series={[{ name: 'Requests', color: '#2f5d8a' }]} rows={d.pipeline.map((p) => ({ label: p.label, parts: [p.count] }))} />
        </div>
        <div className="o-panel">
          <h2>Approvals waiting by approver</h2>
          <StackedBarChart
            series={[
              { name: 'Up to 2 days', color: '#2f5d8a' },
              { name: 'Over 2 days', color: '#c94f6d' },
            ]}
            rows={d.approvers.map((a) => ({ label: a.label, parts: [a.onTime, a.late] }))}
          />
          <p className="o-chart-note">
            Stock value {money(d.stock.value)}, {d.stock.low} {d.stock.low === 1 ? 'item' : 'items'} to reorder.
          </p>
        </div>
      </div>
    </div>
  );
}
