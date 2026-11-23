import { query } from '@orbit/core/next';
import { DataTable, StackedBarChart } from '@orbit/ui';
import { executive } from '../../server';
import { fmtH, ON_TIME_SERIES, waited } from './shared';

/** Management > Timesheet > Approvals waiting: how long, who must approve, and every waiting item. */
export async function ApprovalsView() {
  const d = await query((tx, ctx) => executive.pendingApprovals(tx, ctx));
  return (
    <div className="o-panel o-stack" style={{ gap: 16 }}>
      <div className="o-panel-head" style={{ marginBottom: 0 }}>
        <h2>
          Approvals waiting <span className="faint" style={{ fontSize: 12, fontWeight: 400 }}>{d.list.length}</span>
        </h2>
      </div>
      <div className="o-half">
        <div>
          <h3 className="o-subhead">How long they have been waiting</h3>
          <StackedBarChart series={ON_TIME_SERIES} keepEmpty rows={d.buckets.map((b) => ({ label: b.label, parts: [b.onTime, b.overdue] }))} />
        </div>
        <div>
          <h3 className="o-subhead">Who needs to approve</h3>
          <StackedBarChart
            series={ON_TIME_SERIES}
            rows={d.approvers.map((a) => ({ label: a.label, detail: `oldest ${waited(a.oldest)}`, parts: [a.onTime, a.overdue] }))}
          />
        </div>
      </div>
      <div className="o-panel flush" style={{ border: 0 }}>
        <DataTable
          rows={d.list}
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
  );
}
