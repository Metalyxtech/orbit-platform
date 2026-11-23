import { query } from '@orbit/core/next';
import { ColumnChart, KpiStrip, LineChart, PieChart, StackedBarChart } from '@orbit/ui';
import { SOURCE_COLOR, SOURCE_KIND } from '../../config';
import { dashboard, notReady } from '../../server';

const NOT_YET = <p className="faint">Quality switches on after the latest database update.</p>;
const load = () => query((tx, ctx) => dashboard.dashboard(tx, ctx));
const turn = (h: number | null) => (h === null ? '-' : h < 48 ? `${h} h` : `${Math.round(h / 24)} d`);

/** One-line Quality summary for the Management overview. */
async function QualityHeadline() {
  try {
    const k = (await load()).kpi;
    return (
      <KpiStrip
        items={[
          { value: String(k.pending + k.submitted), label: 'Inspections open', tone: k.pending + k.submitted ? 'hivis' : undefined },
          { value: String(k.month), label: 'Final reports this month' },
          { value: k.passRate === null ? '-' : `${k.passRate}%`, label: 'Pass rate, 6 months' },
          { value: turn(k.avgTurn), label: 'Average time to final approval' },
        ]}
      />
    );
  } catch (err) {
    if (notReady(err)) return NOT_YET;
    throw err;
  }
}

/** Quality in charts: pass rate trend, results by month, what is inspected and who fails most. */
async function QualityCharts() {
  let d;
  try {
    d = await load();
  } catch (err) {
    if (notReady(err)) return NOT_YET;
    throw err;
  }
  const kinds = d.bySource.filter((s) => s.total + s.open > 0);
  return (
    <div className="o-chart-grid">
      <div className="o-panel">
        <h2>Pass rate by month</h2>
        <LineChart
          area
          label="Pass rate by month"
          format={(v) => `${Math.round(v)}%`}
          series={[{ name: 'Pass rate', color: '#3a9a6b' }]}
          points={d.months.map((m) => ({ label: m.label, values: [m.pass + m.fail ? Math.round((m.pass / (m.pass + m.fail)) * 100) : 0] }))}
          empty="No final reports in the last 6 months."
        />
        <p className="o-chart-note">Share of final reports that passed. Last 6 months.</p>
      </div>
      <div className="o-panel">
        <h2>Results by month</h2>
        <ColumnChart
          height={210}
          series={[
            { name: 'Pass', color: '#3a9a6b' },
            { name: 'Fail', color: '#b42318' },
          ]}
          points={d.months.map((m) => ({ label: m.label, values: [m.pass, m.fail] }))}
        />
      </div>
      <div className="o-panel">
        <h2>What was inspected</h2>
        <PieChart unit="" decimals={0} size={170} empty="No final reports in the last 6 months." label="Final reports by kind" slices={d.bySource.map((s) => ({ label: SOURCE_KIND[s.source], value: s.total, color: SOURCE_COLOR[s.source].startsWith('var') ? undefined : SOURCE_COLOR[s.source] }))} />
      </div>
      <div className="o-panel">
        <h2>Open and finished, by kind</h2>
        {kinds.length === 0 ? (
          <div className="o-empty">No inspections in the last 6 months.</div>
        ) : (
          <StackedBarChart
            unit=""
            series={[
              { name: 'Passed', color: '#3a9a6b' },
              { name: 'Failed', color: '#b42318' },
              { name: 'Open', color: '#d4a72c' },
            ]}
            rows={kinds.map((s) => ({ label: SOURCE_KIND[s.source], parts: [s.pass, s.total - s.pass, s.open] }))}
          />
        )}
      </div>
      <div className="o-panel">
        <h2>Most failures</h2>
        {d.worst.length === 0 ? (
          <div className="o-empty">No failed inspections in the last 6 months.</div>
        ) : (
          <StackedBarChart
            unit=""
            series={[
              { name: 'Failed', color: '#b42318' },
              { name: 'Passed', color: '#3a9a6b' },
            ]}
            rows={d.worst.map((w) => ({ label: w.party, detail: SOURCE_KIND[w.source], parts: [w.fail, w.total - w.fail] }))}
          />
        )}
        <p className="o-chart-note">Suppliers and jobs with failed inspections.</p>
      </div>
    </div>
  );
}

async function QualityTab() {
  return (
    <>
      <QualityHeadline />
      <QualityCharts />
    </>
  );
}

/** Quality inside the Management workspace. */
export const qualityManagement = {
  headline: QualityHeadline,
  overview: QualityCharts,
  tabs: [{ id: 'dashboard', label: 'Dashboard', View: QualityTab }],
  links: [
    { label: 'Inspections', path: 'inspections' },
    { label: 'Final reports', path: 'reports' },
  ],
};
