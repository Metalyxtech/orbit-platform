import { query } from '@orbit/core/next';
import { DataTable, TrendChart } from '@orbit/ui';
import { executive } from '../../server';
import { TimesheetHeadline } from './Headline';

/** Management > Timesheet > Summary: headline numbers, hours per week, approvals by level. */
export async function SummaryView() {
  const d = await query((tx, ctx) => executive.summaryView(tx, ctx));
  return (
    <>
      <TimesheetHeadline />
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
    </>
  );
}
