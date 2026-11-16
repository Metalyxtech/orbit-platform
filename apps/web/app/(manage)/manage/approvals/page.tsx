import { redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { approvals } from '@orbit/portal-timesheet/server';
import { DataTable, EmptyState } from '@orbit/ui';
import { inboxItems } from '@/inbox';
import { isManager } from '@/management/workspaces';
import { accessiblePortals } from '@/portal-access';

export const dynamic = 'force-dynamic';

/** Approvals assigned to me, across portals. Decisions are made in the portal's own approval screen. */
export default async function MyApprovals() {
  const s = await getSession();
  if (s.state !== 'ok' || !isManager(s.ctx)) redirect('/manage/messages');
  // Timesheet approvals only for companies with Timesheet; every other portal's tasks come from its own queue.
  const { rows, timesheet, tasks } = await query(async (tx, ctx) => {
    const portals = await accessiblePortals(tx, ctx);
    const timesheet = portals.includes('timesheet');
    return {
      timesheet,
      rows: timesheet ? await approvals.mine(tx, ctx) : [],
      tasks: (await inboxItems(tx, ctx)).filter((i) => i.portal !== 'Timesheet' && i.portal !== 'Messages'),
    };
  });
  return (
    <>
      <header className="o-top">
        <strong>My approvals</strong>
      </header>
      <div className="o-page">
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Everything waiting for you across your portals. Open a task to decide it in its own portal.
        </p>
        {(tasks.length > 0 || !timesheet) && (
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Waiting for you</h2>
            </div>
            {tasks.length === 0 ? (
              <EmptyState title="Nothing is waiting for you." />
            ) : (
              <DataTable
                rows={tasks}
                rowKey={(t) => t.id}
                columns={[
                  { key: 'p', header: 'Portal', render: (t) => <span className="o-chip steel">{t.portal}</span> },
                  { key: 't', header: 'Task', render: (t) => <strong style={{ fontWeight: 600 }}>{t.title}</strong> },
                  { key: 'd', header: 'Details', render: (t) => <span className="muted">{t.detail}</span> },
                  { key: 'u', header: '', render: (t) => (t.urgent ? <span className="o-chip hivis">Needs action</span> : null) },
                  {
                    key: 'a',
                    header: '',
                    render: (t) => (
                      <a className="o-btn small primary" href={t.href}>
                        Open
                      </a>
                    ),
                  },
                ]}
              />
            )}
          </div>
        )}
        {timesheet && (
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
        )}
      </div>
    </>
  );
}
