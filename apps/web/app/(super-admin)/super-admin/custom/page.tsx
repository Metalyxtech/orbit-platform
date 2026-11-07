import Link from 'next/link';
import { KpiStrip } from '@orbit/ui';
import { areaLabel, STATUSES, statusOf } from '@/custom/requests';
import { allCustomRequests } from '../custom-data';
import { fmtDate, requireSuperAdminPage } from '../data';

export const dynamic = 'force-dynamic';

/** Super Admin > Custom work: requirements and forms sent by custom customers, newest first. */
export default async function CustomWork({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await requireSuperAdminPage();
  const status = (await searchParams).status;
  const all = await allCustomRequests(me.userId);
  const rows = status ? all.filter((r) => r.status === status) : all;
  const count = (s: string) => all.filter((r) => r.status === s).length;
  return (
    <>
      <header className="o-top">
        <strong>Custom work</strong>
      </header>
      <div className="o-page">
        <p className="muted" style={{ margin: 0 }}>
          Forms and changes sent by custom customers. Open one to see their files, then build it in that company&apos;s custom portal (portals/custom-*).
        </p>
        <KpiStrip
          items={[
            { value: String(count('new')), label: 'New', tone: count('new') ? 'hivis' : undefined },
            { value: String(count('reviewing') + count('in_progress')), label: 'Reviewing or being built' },
            { value: String(count('ready')), label: 'Ready' },
            { value: String(all.length), label: 'All requirements' },
          ]}
        />
        <div className="o-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <Link className={`o-btn small${!status ? ' primary' : ''}`} href="/super-admin/custom">
            All
          </Link>
          {STATUSES.map((s) => (
            <Link key={s.id} className={`o-btn small${status === s.id ? ' primary' : ''}`} href={`/super-admin/custom?status=${s.id}`}>
              {s.label} ({count(s.id)})
            </Link>
          ))}
        </div>
        <div className="o-panel flush">
          <div className="o-scroll">
            <table className="o-table">
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>Company</th>
                  <th>Requirement</th>
                  <th>About</th>
                  <th className="num">Files</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.createdAt)}</td>
                    <td>{r.company}</td>
                    <td>
                      <strong>{r.title}</strong>
                      <div className="faint" style={{ fontSize: 11 }}>by {r.requestedName}</div>
                    </td>
                    <td>{areaLabel(r.area)}</td>
                    <td className="num">{r.files.length}</td>
                    <td>
                      <span className={`o-chip ${statusOf(r.status).tone}`}>{statusOf(r.status).label}</span>
                    </td>
                    <td>
                      <Link className="o-btn small" href={`/super-admin/custom/${r.companyId}/${r.id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <div className="o-empty">Nothing here yet.</div>}
        </div>
      </div>
    </>
  );
}
