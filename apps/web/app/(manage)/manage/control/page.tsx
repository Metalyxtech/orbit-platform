import Link from 'next/link';
import { redirect } from 'next/navigation';
import { canControl, CONTROLLED, controlOverview } from '@orbit/core/holds';
import { getSession, query } from '@orbit/core/next';
import { Chip, DataTable, EmptyState, KpiStrip } from '@orbit/ui';
import { accessiblePortals } from '@/portal-access';
import { portalModules } from '@/portals';

export const dynamic = 'force-dynamic';

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const days = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5));

/**
 * GM process control: every process stopped across the portals, and the latest comments. The GM
 * opens any record from here, comments on it, or resumes it on its own page.
 */
export default async function ProcessControlPage() {
  const s = await getSession();
  if (s.state !== 'ok' || !canControl(s.ctx)) redirect('/manage');
  const d = await query(async (tx, ctx) => controlOverview(tx, ctx, await accessiblePortals(tx, ctx)));
  const portal = (p: string) => portalModules[p]?.manifest.name ?? p;
  const week = d.recent.filter((c) => days(c.at) < 7);
  const oldest = d.held.reduce((m, h) => Math.max(m, days(h.at)), 0);
  return (
    <>
      <header className="o-top">
        <strong>Process control</strong>
      </header>
      <div className="o-page">
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          As GM you can open any purchase request, work order, material request, inspection or enquiry, <strong>comment</strong> on it, and <strong>stop</strong> it with a reason.
          A stopped process cannot move to its next step until you <strong>resume</strong> it. Use Stop / Resume in the Comments panel on the record&apos;s page.
        </p>
        {!d.ready && <EmptyState title="Process control switches on after the latest database update." />}
        <KpiStrip
          items={[
            { value: String(d.held.length), label: 'On hold now', tone: d.held.length ? 'hivis' : undefined },
            { value: d.held.length ? `${oldest} d` : '-', label: 'Longest hold' },
            { value: String(week.filter((c) => c.kind === 'comment').length), label: 'Comments this week' },
            { value: String(week.filter((c) => c.gm).length), label: 'GM notes this week' },
          ]}
        />
        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>On hold</h2>
          </div>
          <DataTable
            rows={d.held}
            rowKey={(r) => r.id}
            empty={<EmptyState title="Nothing is on hold. Every process is moving." />}
            columns={[
              { key: 'r', header: 'Record', render: (r) => <Link href={r.href}><strong>{r.ref}</strong> <span className="muted">{r.title}</span></Link> },
              { key: 'p', header: 'Portal', render: (r) => <Chip tone="steel">{`${portal(r.portal)} · ${CONTROLLED[r.entity]?.label ?? r.entity}`}</Chip> },
              { key: 'w', header: 'Reason', render: (r) => <span style={{ fontSize: 13 }}>“{r.reason}”</span> },
              { key: 'b', header: 'Stopped by', render: (r) => `${r.by}, ${when(r.at)}` },
              { key: 'd', header: 'Days', num: true, render: (r) => days(r.at) },
            ]}
          />
        </div>
        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>Latest comments</h2>
          </div>
          <DataTable
            rows={d.recent}
            rowKey={(r) => r.id}
            empty={<EmptyState title="No comments yet." />}
            columns={[
              { key: 'a', header: 'When', render: (r) => when(r.at) },
              { key: 'r', header: 'Record', render: (r) => <Link href={r.href}><strong>{r.ref}</strong> <span className="muted">{portal(r.portal)}</span></Link> },
              {
                key: 't',
                header: 'Comment',
                render: (r) => (
                  <span style={{ fontSize: 13 }}>
                    {r.kind !== 'comment' && (
                      <span style={{ marginRight: 6 }}>
                        <Chip tone={r.kind === 'hold' ? 'bad' : 'ok'}>{r.kind === 'hold' ? 'Stopped' : 'Resumed'}</Chip>
                      </span>
                    )}
                    {r.text.length > 160 ? `${r.text.slice(0, 157)}…` : r.text}
                  </span>
                ),
              },
              { key: 'b', header: 'By', render: (r) => (r.gm ? <strong>{r.by} (GM)</strong> : r.by) },
            ]}
          />
        </div>
      </div>
    </>
  );
}
