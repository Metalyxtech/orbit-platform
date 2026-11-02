import { query } from '@orbit/core/next';
import { DataTable, EmptyState, HBarChart, KpiStrip, PieChart, StackedBarChart, TrendChart } from '@orbit/ui';
import { executive } from '../server';

const fmtH = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const STATUS = [
  { key: 'locked', name: 'Approved', color: '#3a9a6b' },
  { key: 'in_approval', name: 'Waiting for approval', color: '#2f5d8a' },
  { key: 'returned', name: 'Returned', color: '#e07b39' },
  { key: 'draft', name: 'Draft (not submitted)', color: '#9aa3ab' },
] as const;
const waited = (h: number) => (h < 24 ? `${h} h` : `${Math.floor(h / 24)} d ${h % 24} h`);

/** Timesheet section of the Management workspace overview: KPIs, weekly trend, projects and where approvals wait. */
export async function TimesheetExecutive({ params = {} }: { params?: Record<string, string | undefined> }) {
  const period = params.period === 'week' ? 'week' : 'month';
  const d = await query((tx, ctx) => executive.executiveSummary(tx, ctx, period));
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
      <div className="o-panel o-stack" style={{ gap: 16 }}>
        <div className="o-panel-head" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 0 }}>
          <h2>Hours by person, {d.people.label}</h2>
          <nav className="o-seg" aria-label="Period">
            <a href="?period=week" aria-current={period === 'week' ? 'page' : undefined}>
              This week
            </a>
            <a href="?period=month" aria-current={period === 'month' ? 'page' : undefined}>
              This month
            </a>
          </nav>
        </div>
        <div className="o-half">
          <div>
            <h3 className="o-subhead">Each person, all hours entered</h3>
            <PieChart slices={d.people.rows.map((r) => ({ label: r.name, value: r.hours, detail: r.title ?? undefined }))} />
          </div>
          <div>
            <h3 className="o-subhead">Where the hours are</h3>
            <PieChart slices={STATUS.map((st) => ({ label: st.name, value: d.people.totals[st.key], color: st.color }))} />
          </div>
        </div>
        <div>
          <h3 className="o-subhead">Status by person</h3>
          <StackedBarChart
            unit="h"
            series={STATUS.map((st) => ({ name: st.name, color: st.color }))}
            rows={d.people.rows.map((r) => ({ label: r.name, detail: r.title ?? undefined, parts: STATUS.map((st) => r.byStatus[st.key]) }))}
          />
        </div>
        <p className="faint" style={{ fontSize: 11, margin: 0 }}>
          Includes drafts that are not submitted yet. Rejected timesheets are left out. Hover a slice or bar for details.
        </p>
      </div>

      <div className="o-panel o-stack" style={{ gap: 16 }}>
        <div className="o-panel-head" style={{ marginBottom: 0 }}>
          <h2>
            Approvals waiting <span className="faint" style={{ fontSize: 12, fontWeight: 400 }}>{d.pending.list.length}</span>
          </h2>
        </div>
        <div className="o-half">
          <div>
            <h3 className="o-subhead">How long they have been waiting</h3>
            <StackedBarChart
              series={[
                { name: 'On time', color: '#2f5d8a' },
                { name: 'Overdue', color: '#c94f6d' },
              ]}
              keepEmpty
              rows={d.pending.buckets.map((b) => ({ label: b.label, parts: [b.onTime, b.overdue] }))}
            />
          </div>
          <div>
            <h3 className="o-subhead">Who needs to approve</h3>
            <StackedBarChart
              series={[
                { name: 'On time', color: '#2f5d8a' },
                { name: 'Overdue', color: '#c94f6d' },
              ]}
              rows={d.pending.approvers.map((a) => ({ label: a.label, detail: `oldest ${waited(a.oldest)}`, parts: [a.onTime, a.overdue] }))}
            />
          </div>
        </div>
        <div className="o-panel flush" style={{ border: 0 }}>
          <DataTable
            rows={d.pending.list}
            rowKey={(r) => r.taskId}
            empty={<span className="faint">Nothing is waiting for approval.</span>}
            columns={[
              { key: 'e', header: 'Employee', render: (r) => r.employee },
              { key: 'w', header: 'Week', num: true, render: (r) => r.week },
              { key: 'h', header: 'Hours', num: true, render: (r) => fmtH(r.hours) },
              { key: 'l', header: 'Level', render: (r) => r.level },
              {
                key: 'a',
                header: 'Waiting for',
                render: (r) => (
                  <div>
                    {r.approver}
                    {r.approverTitle && <div className="faint" style={{ fontSize: 11 }}>{r.approverTitle}</div>}
                  </div>
                ),
              },
              { key: 't', header: 'Waiting', num: true, render: (r) => waited(r.waitingHours) },
              { key: 'd', header: '', render: (r) => (r.overdue ? <span className="o-chip bad">Overdue</span> : <span className="o-chip ok">On time</span>) },
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
