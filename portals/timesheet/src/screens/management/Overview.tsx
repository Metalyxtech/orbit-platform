import { query } from '@orbit/core/next';
import { ColumnChart, CompareKpis, PieChart, StackedBarChart, TrendChart } from '@orbit/ui';
import { executive } from '../../server';
import { fmtH, STATUS } from './shared';

/** Timesheet charts for the Management overview (GM, CEO, directors and admins). */
export async function TimesheetOverview() {
  const d = await query((tx, ctx) => executive.overviewCharts(tx, ctx));
  const otPct = (k: { approvedHours: number; overtimeHours: number }) => (k.approvedHours ? (k.overtimeHours / k.approvedHours) * 100 : 0);
  return (
    <div className="o-stack" style={{ gap: 16 }}>
      <CompareKpis
        items={[
          { label: `Approved hours, ${d.monthLabel}`, value: fmtH(d.now.approvedHours), now: d.now.approvedHours, before: d.before.approvedHours },
          { label: 'Overtime hours', value: fmtH(d.now.overtimeHours), now: d.now.overtimeHours, before: d.before.overtimeHours, goodWhen: 'down', note: `${otPct(d.now).toFixed(1)}% of hours` },
          { label: 'Weeks submitted on time', value: `${d.now.onTimePct}%`, now: d.now.onTimePct, before: d.before.onTimePct },
          { label: 'Waiting for approval', value: String(d.now.waiting), now: d.now.waiting, before: null, note: 'Right now' },
        ]}
      />
      <div className="o-chart-grid">
        <div className="o-panel">
          <h2>Approved hours by month</h2>
          <ColumnChart
            series={[
              { name: 'Regular', color: '#2f5d8a' },
              { name: 'Overtime', color: '#e07b39' },
            ]}
            points={d.months.map((m) => ({ label: m.label, values: [m.regular, m.overtime] }))}
          />
          <p className="o-chart-note">Last 6 months, approved timesheets only.</p>
        </div>
        <div className="o-panel">
          <h2>Hours per week</h2>
          <TrendChart points={d.trend} />
          <p className="o-chart-note">Submitted and approved, last 12 weeks. Overtime on top.</p>
        </div>
        <div className="o-panel">
          <h2>Hours by person, {d.monthLabel}</h2>
          <PieChart slices={d.people.rows.map((r) => ({ label: r.name, value: r.hours, detail: r.title ?? undefined }))} />
        </div>
        <div className="o-panel">
          <h2>Where the hours are</h2>
          <PieChart slices={STATUS.map((s) => ({ label: s.name, value: d.people.totals[s.key], color: s.color }))} />
          <p className="o-chart-note">All hours entered this month, drafts included.</p>
        </div>
        <div className="o-panel">
          <h2>Hours by project, {d.monthLabel}</h2>
          <StackedBarChart
            unit="h"
            series={[
              { name: 'Regular', color: '#2f5d8a' },
              { name: 'Overtime', color: '#e07b39' },
            ]}
            rows={d.byProject.map((p) => ({ label: p.label, parts: [p.regular, p.overtime] }))}
          />
        </div>
        <div className="o-panel">
          <h2>Approvals waiting by level</h2>
          <StackedBarChart
            keepEmpty
            series={[
              { name: 'On time', color: '#2f5d8a' },
              { name: 'Overdue', color: '#c94f6d' },
            ]}
            rows={d.levels.map((l) => ({ label: l.level, parts: [l.waiting - l.overdue, l.overdue] }))}
          />
        </div>
      </div>
    </div>
  );
}
