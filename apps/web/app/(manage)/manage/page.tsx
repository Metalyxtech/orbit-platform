import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { approvals } from '@orbit/portal-timesheet/server';
import { DataTable } from '@orbit/ui';
import { executiveSections } from '@/executive';
import { listMessages } from '@/messages';
import { accessiblePortals } from '@/portal-access';

export const dynamic = 'force-dynamic';

/** Management overview: what waits for me, latest messages, then one section per portal. */
export default async function Overview() {
  const s = await getSession();
  if (s.state !== 'ok' || (s.ctx.role !== 'management' && s.ctx.role !== 'company_admin')) redirect('/manage/messages');
  const d = await query(async (tx, ctx) => ({
    name: ctx.name.split(' ')[0],
    company: ctx.companyName,
    portals: await accessiblePortals(tx, ctx),
    waiting: await approvals.mine(tx, ctx),
    inbox: await listMessages(tx, ctx, 'inbox'),
  }));
  const unread = d.inbox.data.filter((m) => !m.readAt);
  return (
    <>
      <header className="o-top">
        <strong>Overview</strong>
      </header>
      <div className="o-page">
        <div>
          <h1>Hello, {d.name}</h1>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            {d.company} at a glance, across every portal.
          </p>
        </div>
        <div className="o-half">
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Waiting for your approval</h2>
              <Link className="o-btn small" href="/manage/approvals">
                Open
              </Link>
            </div>
            <DataTable
              rows={d.waiting.slice(0, 5)}
              rowKey={(r) => r.taskId}
              empty={<span className="faint">Nothing waiting. You are up to date.</span>}
              columns={[
                { key: 'e', header: 'Employee', render: (r) => r.employee },
                { key: 'w', header: 'Week', num: true, render: (r) => r.week },
                { key: 'h', header: 'Hours', num: true, render: (r) => r.total.toFixed(1) },
                { key: 'o', header: '', render: (r) => (r.overdue ? <span className="o-chip bad">Overdue</span> : <span className="faint">{r.stepLabel}</span>) },
              ]}
            />
          </div>
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Messages {unread.length ? <span className="o-badge">{unread.length}</span> : null}</h2>
              <Link className="o-btn small" href="/manage/messages">
                Write
              </Link>
            </div>
            <DataTable
              rows={d.inbox.data.slice(0, 5)}
              rowKey={(r) => r.id}
              empty={<span className="faint">{d.inbox.ok ? 'No messages yet.' : 'Messages switch on after the latest database update.'}</span>}
              columns={[
                { key: 'f', header: 'From', render: (r) => (r.readAt ? r.otherName : <strong>{r.otherName}</strong>) },
                { key: 's', header: 'Subject', render: (r) => <>{r.kind === 'review' && <span className="o-chip warn">Review</span>} {r.subject}</> },
              ]}
            />
          </div>
        </div>
        {d.portals.map((p) => {
          const Section = executiveSections[p];
          return Section ? <Section key={p} /> : null;
        })}
      </div>
    </>
  );
}
