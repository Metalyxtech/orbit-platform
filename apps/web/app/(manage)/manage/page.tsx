import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { DataTable } from '@orbit/ui';
import { inboxItems } from '@/inbox';
import { CompanyGlance } from '@/management/CompanyGlance';
import { companyGlance } from '@/management/glance';
import { isManager, workspaceFor } from '@/management/workspaces';
import { listMessages } from '@/messages';
import { accessiblePortals } from '@/portal-access';
import { portalModules } from '@/portals';

export const dynamic = 'force-dynamic';

/** Management overview: what waits for me, latest messages, then a short summary per portal. */
export default async function Overview() {
  const s = await getSession();
  if (s.state !== 'ok' || !isManager(s.ctx)) redirect('/manage/messages');
  const d = await query(async (tx, ctx) => ({
    name: ctx.name.split(' ')[0],
    company: ctx.companyName,
    portals: await accessiblePortals(tx, ctx),
    // Tasks waiting in any portal the company has (not only Timesheet approvals).
    tasks: (await inboxItems(tx, ctx)).filter((i) => i.portal !== 'Messages'),
    inbox: await listMessages(tx, ctx, 'inbox'),
  }));
  const glance = await query(async (tx, ctx) => companyGlance(tx, ctx, d.portals));
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
        <CompanyGlance labels={glance.labels} rows={glance.rows} waiting={d.tasks.length} />
        <div className="o-half">
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Waiting for you {d.tasks.length ? <span className="o-badge">{d.tasks.length}</span> : null}</h2>
              <Link className="o-btn small" href="/manage/approvals">
                Open
              </Link>
            </div>
            <DataTable
              rows={d.tasks.slice(0, 5)}
              rowKey={(r) => r.id}
              empty={<span className="faint">Nothing waiting. You are up to date.</span>}
              columns={[
                { key: 'p', header: 'Portal', render: (r) => <span className="o-chip steel">{r.portal}</span> },
                { key: 't', header: 'Task', render: (r) => <Link href={r.href}>{r.title}</Link> },
                { key: 'o', header: '', render: (r) => (r.urgent ? <span className="o-chip hivis">Needs action</span> : null) },
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
          const mod = workspaceFor(s.ctx).modules[p];
          if (!mod || !portalModules[p]) return null;
          const Headline = mod.overview ?? mod.headline;
          return (
            <section key={p} className="o-stack" style={{ gap: 12 }}>
              <div className="o-row" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>{portalModules[p].manifest.name}</h2>
                <Link className="o-btn small" href={`/manage/${p}`}>
                  Open details
                </Link>
              </div>
              {Headline && <Headline />}
            </section>
          );
        })}
      </div>
    </>
  );
}
