import { query } from '@orbit/core/next';
import { ColumnChart, CompareKpis, KpiStrip, LineChart, PieChart, StackedBarChart } from '@orbit/ui';
import { fmtShort } from '../../config';
import { dashboard, loadConfig, management, notReady } from '../../server';

const NOT_YET = <p className="faint">Sales switches on after the latest database update.</p>;
const STAGE_COLORS = ['#9aa3ab', '#d4a72c', '#2f5d8a', '#e07b39'];

/** One-line Sales summary for the Management overview. */
async function SalesHeadline() {
  try {
    const d = await query((tx, ctx) => dashboard.dashboard(tx, ctx));
    const cur = d.cfg.currency;
    return (
      <KpiStrip
        items={[
          { value: String(d.kpi.openCount), label: 'Open enquiries' },
          { value: fmtShort(cur, d.kpi.pipeline), label: 'Pipeline value' },
          { value: fmtShort(cur, d.kpi.won), label: 'Orders this month' },
          { value: fmtShort(cur, d.kpi.outstanding), label: `To collect (${fmtShort(cur, d.kpi.overdue)} overdue)`, tone: d.kpi.overdue ? 'hivis' : undefined },
        ]}
      />
    );
  } catch (err) {
    if (notReady(err)) return NOT_YET;
    throw err;
  }
}

/** Sales in charts: the trend of enquiries, orders and money, the pipeline, sources, outcomes and customers. */
async function SalesCharts() {
  let d;
  try {
    d = await query(async (tx, ctx) => ({ c: await management.managementCharts(tx, ctx), dash: await dashboard.dashboard(tx, ctx), cfg: await loadConfig(tx, ctx.companyId) }));
  } catch (err) {
    if (notReady(err)) return NOT_YET;
    throw err;
  }
  const cur = d.cfg.currency;
  const money = (v: number) => fmtShort(cur, v);
  const c = d.c;
  return (
    <div className="o-stack" style={{ gap: 16 }}>
      <CompareKpis
        items={[
          { label: 'Orders booked this month', value: String(c.months[5].orders), now: c.months[5].orders, before: c.months[4].orders, note: money(c.now.orderValue) },
          { label: 'New enquiries', value: String(c.now.enquiries), now: c.now.enquiries, before: c.before.enquiries },
          { label: 'Collected this month', value: money(c.now.collected), now: c.now.collected, before: c.before.collected },
          { label: 'Win rate, 6 months', value: c.outcome.winRate === null ? '-' : `${c.outcome.winRate}%`, now: c.outcome.winRate ?? 0, before: null, note: `${c.outcome.won} won, ${c.outcome.lost} lost` },
        ]}
      />
      <div className="o-chart-grid">
        <div className="o-panel">
          <h2>Order value by month</h2>
          <LineChart area label="Order value by month" format={money} series={[{ name: 'Orders', color: '#2f5d8a' }]} points={c.months.map((m) => ({ label: m.label, values: [m.orderValue] }))} empty="No orders in the last 6 months." />
          <p className="o-chart-note">Value of orders booked, before GST. Last 6 months.</p>
        </div>
        <div className="o-panel">
          <h2>Enquiries and orders by month</h2>
          <LineChart
            label="Enquiries and orders by month"
            series={[
              { name: 'Enquiries', color: '#e07b39' },
              { name: 'Orders won', color: '#3a9a6b' },
            ]}
            points={c.months.map((m) => ({ label: m.label, values: [m.enquiries, m.orders] }))}
            empty="No enquiries in the last 6 months."
          />
          <p className="o-chart-note">How many came in, and how many became orders.</p>
        </div>
        <div className="o-panel">
          <h2>Pipeline by stage</h2>
          <PieChart unit="" decimals={0} size={170} empty="No open enquiries." label="Open enquiries by stage" slices={d.dash.byStage.map((s, i) => ({ label: s.label, value: s.count, detail: s.count ? money(s.value) : undefined, color: STAGE_COLORS[i % STAGE_COLORS.length] }))} />
        </div>
        <div className="o-panel">
          <h2>Where enquiries come from</h2>
          <PieChart unit="" decimals={0} size={170} empty="No enquiries in the last 6 months." label="Enquiries by source" slices={c.bySource} />
        </div>
        <div className="o-panel">
          <h2>Invoiced and collected by month</h2>
          <ColumnChart
            format={money}
            series={[
              { name: 'Invoiced', color: '#9aa3ab' },
              { name: 'Collected', color: '#3a9a6b' },
            ]}
            points={c.months.map((m) => ({ label: m.label, values: [m.invoiced, m.collected] }))}
          />
        </div>
        <div className="o-panel">
          <h2>To collect, by age</h2>
          {c.outstanding <= 0.5 ? (
            <div className="o-empty">Nothing outstanding.</div>
          ) : (
            <StackedBarChart
              format={money}
              keepEmpty
              series={[{ name: 'Outstanding', color: '#2f5d8a' }]}
              rows={[
                { label: 'Not yet due', parts: [Math.round(c.ageing.current)] },
                { label: '1 to 30 days late', parts: [Math.round(c.ageing.d30)] },
                { label: '31 to 60 days late', parts: [Math.round(c.ageing.d60)] },
                { label: 'Over 60 days late', parts: [Math.round(c.ageing.d90)] },
              ]}
            />
          )}
          <p className="o-chart-note">{money(c.outstanding)} outstanding in all.</p>
        </div>
        <div className="o-panel">
          <h2>Top customers, 6 months</h2>
          {c.topCustomers.length === 0 ? <div className="o-empty">No orders in the last 6 months.</div> : <StackedBarChart format={money} series={[{ name: 'Order value', color: '#2f5d8a' }]} rows={c.topCustomers.map((x) => ({ label: x.label, parts: [Math.round(x.value)] }))} />}
        </div>
        <div className="o-panel">
          <h2>Why enquiries were lost</h2>
          <PieChart unit="" decimals={0} size={170} empty="No lost enquiries in the last 6 months." label="Lost enquiries by reason" slices={c.lostReasons} />
        </div>
      </div>
    </div>
  );
}

async function SalesTab() {
  return (
    <>
      <SalesHeadline />
      <SalesCharts />
    </>
  );
}

/** Sales inside the Management workspace. */
export const salesManagement = {
  headline: SalesHeadline,
  overview: SalesCharts,
  tabs: [{ id: 'dashboard', label: 'Dashboard', View: SalesTab }],
  links: [
    { label: 'Pipeline', path: 'pipeline' },
    { label: 'Sales orders', path: 'orders' },
    { label: 'Invoices', path: 'invoices' },
  ],
};
