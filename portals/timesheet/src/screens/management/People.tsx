import { query } from '@orbit/core/next';
import { PieChart, StackedBarChart } from '@orbit/ui';
import { executive } from '../../server';
import { STATUS, type ViewProps } from './shared';

/** Management > Timesheet > Hours by person: all hours entered (drafts too), by person and status. */
export async function PeopleView({ params = {} }: ViewProps) {
  const period = params.period === 'week' ? 'week' : 'month';
  const d = await query((tx, ctx) => executive.hoursByPersonFor(tx, ctx, period));
  return (
    <div className="o-panel o-stack" style={{ gap: 16 }}>
      <div className="o-panel-head" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 0 }}>
        <h2>Hours by person, {d.label}</h2>
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
          <PieChart slices={d.rows.map((r) => ({ label: r.name, value: r.hours, detail: r.title ?? undefined }))} />
        </div>
        <div>
          <h3 className="o-subhead">Where the hours are</h3>
          <PieChart slices={STATUS.map((st) => ({ label: st.name, value: d.totals[st.key], color: st.color }))} />
        </div>
      </div>
      <div>
        <h3 className="o-subhead">Status by person</h3>
        <StackedBarChart
          unit="h"
          series={STATUS.map((st) => ({ name: st.name, color: st.color }))}
          rows={d.rows.map((r) => ({ label: r.name, detail: r.title ?? undefined, parts: STATUS.map((st) => r.byStatus[st.key]) }))}
        />
      </div>
      <p className="faint" style={{ fontSize: 11, margin: 0 }}>
        Includes drafts that are not submitted yet. Rejected timesheets are left out. Hover a slice or bar for details.
      </p>
    </div>
  );
}
