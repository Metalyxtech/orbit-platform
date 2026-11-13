import { redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { approvals } from '@orbit/portal-timesheet/server';
import { DataTable, EmptyState } from '@orbit/ui';
import { isManager } from '@/management/workspaces';

export const dynamic = 'force-dynamic';

/** Approvals assigned to me, across portals. Decisions are made in the portal's own approval screen. */
export default async function MyApprovals() {
  const s = await getSession();
  if (s.state !== 'ok' || !isManager(s.ctx)) redirect('/manage/messages');
  const rows = await query((tx, ctx) => approvals.mine(tx, ctx));
  return (
    <>
      <header className="o-top">
        <strong>My approvals</strong>
      </header>
      <div className="o-page">
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Only the steps your approval workflow sends to you, for example the final level after the project manager.
        </p>
        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>Timesheet</h2>
            <a className="o-btn small primary" href="/timesheet/approvals">
              Review and decide
            </a>
          </div>
          {rows.length === 0 ? (
            <EmptyState title="Nothing is waiting for you." />
          ) : (
            <DataTable
              rows={rows}
              rowKey={(r) => r.taskId}
              columns={[
                { key: 'e', header: 'Employee', render: (r) => r.employee },
                { key: 'w', header: 'Week', num: true, render: (r) => r.week },
                { key: 't', header: 'Hours', num: true, render: (r) => r.total.toFixed(1) },
                { key: 'o', header: 'Overtime', num: true, render: (r) => (r.overtime ? r.overtime.toFixed(1) : '-') },
                { key: 's', header: 'Step', render: (r) => r.stepLabel },
                { key: 'd', header: '', render: (r) => (r.overdue ? <span className="o-chip bad">Overdue</span> : null) },
              ]}
            />
          )}
        </div>
      </div>
    </>
  );
}
