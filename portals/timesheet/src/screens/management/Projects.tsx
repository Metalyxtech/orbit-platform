import { query } from '@orbit/core/next';
import { DataTable, EmptyState, HBarChart } from '@orbit/ui';
import { executive } from '../../server';
import { fmtH, monthName } from './shared';

/** Management > Timesheet > Projects: approved hours by project and the highest overtime this month. */
export async function ProjectsView() {
  const d = await query((tx, ctx) => executive.projectsView(tx, ctx));
  return (
    <div className="o-cols-wide">
      <div className="o-panel">
        <div className="o-panel-head">
          <h2>Hours by project, {monthName(d.month)}</h2>
        </div>
        {d.byProject.length ? (
          <HBarChart rows={d.byProject.map((p) => ({ label: p.label, regular: p.regular, overtime: p.overtime }))} />
        ) : (
          <EmptyState title="No approved hours this month yet." />
        )}
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
  );
}
