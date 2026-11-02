import { query } from '@orbit/core/next';
import { DataTable, EmptyState, HBarChart, KpiStrip, TrendChart } from '@orbit/ui';
import { executive } from '../server';

const fmtH = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Timesheet section of the Management workspace overview: KPIs, weekly trend, projects and where approvals wait. */
export async function TimesheetExecutive() {
  const d = await query((tx, ctx) => executive.executiveSummary(tx, ctx));
  const monthLabel = new Date(`${d.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  const k = d.kpis;
  const overdue = d.levels.reduce((n, l) => n + l.overdue, 0);
  return (
    <section className="o-stack" style={{ gap: 16 }}>
      <div className="o-row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Timesheet</h2>
        <a className="o-btn small" href="/timesheet/reports">
          Full reports
        </a>
      </div>
      <KpiStrip
        items={[
          { value: fmtH(k.approvedHours), label: `Approved hours, ${monthLabel}` },
          { value: fmtH(k.overtimeHours), label: `Overtime (${k.overtimePct}%)`, tone: 'hivis' },
          { value: `${k.onTimePct}%`, label: 'Weeks submitted on time' },
          { value: String(k.waiting), label: overdue ? `In approval (${overdue} overdue)` : 'In approval' },
        ]}
      />
      <div className="o-cols-wide">
        <div className="o-panel">
          <div className="o-panel-head">
            <h2>Hours per week</h2>
            <span className="o-legend">
              <span>
                <i style={{ background: 'var(--steel)' }} />
                Regular
              </span>
              <span>
                <i style={{ background: 'var(--hivis-tint)', border: '1px solid var(--hivis)' }} />
                Overtime
              </span>
            </span>
          </div>
          <TrendChart points={d.trend} />
          <p className="faint" style={{ fontSize: 11, margin: '6px 0 0' }}>
            Submitted and approved timesheets, last 8 weeks.
          </p>
        </div>
        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>Approvals by level</h2>
          </div>
          <DataTable
            rows={d.levels}
            rowKey={(r) => r.level}
            empty={<span className="faint">Nothing waiting.</span>}
            columns={[
              { key: 'l', header: 'Level', render: (r) => r.level },
              { key: 'w', header: 'Waiting', num: true, render: (r) => r.waiting },
              { key: 'o', header: 'Overdue', num: true, render: (r) => (r.overdue ? <span className="o-chip bad">{r.overdue}</span> : '-') },
            ]}
          />
        </div>
      </div>
      <div className="o-cols-wide">
        <div className="o-panel">
          <div className="o-panel-head">
            <h2>Hours by project, {monthLabel}</h2>
          </div>
          {d.byProject.length ? (
            <HBarChart rows={d.byProject.map((p) => ({ label: p.label, regular: p.regular, overtime: p.overtime }))} />
          ) : (
            <EmptyState title="No approved hours this month yet." />
          )}
        </div>
        <div className="o-stack" style={{ gap: 16 }}>
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Waiting by approver</h2>
            </div>
            <DataTable
              rows={d.byApprover}
              rowKey={(r) => r.name}
              empty={<span className="faint">Nothing waiting.</span>}
              columns={[
                { key: 'a', header: 'Approver', render: (r) => r.name },
                { key: 'w', header: 'Waiting', num: true, render: (r) => r.waiting },
                { key: 'o', header: 'Oldest', num: true, render: (r) => (r.oldestHours >= 24 ? <span className="o-chip bad">{r.oldestHours} h</span> : `${r.oldestHours} h`) },
              ]}
            />
          </div>
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Highest overtime</h2>
            </div>
            <DataTable
              rows={d.top}
              rowKey={(r) => r.name}
              empty={<span className="faint">No approved overtime this month.</span>}
              columns={[
                { key: 'n', header: 'Name', render: (r) => r.name },
                { key: 'o', header: 'Overtime', num: true, render: (r) => `${fmtH(r.overtime)} h` },
              ]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
