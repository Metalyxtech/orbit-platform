import Link from 'next/link';
import { KpiStrip, StatusChip } from '@orbit/ui';
import { approveCompanyAction } from './actions';
import { companyStatusChip, fmtDate, loadCompanies, loadPeople, requireSuperAdminPage } from './data';

/** Super Admin > Companies: one compact row per company; details live on the company page. */
export default async function Companies() {
  const me = await requireSuperAdminPage();
  const rows = await loadCompanies();
  const people = await Promise.all(rows.map((c) => loadPeople(c.id, me.userId)));
  const order = { pending: 0, active: 1, suspended: 2 } as const;
  const list = rows
    .map((c, i) => ({ c, people: people[i] }))
    .sort((a, b) => order[a.c.status] - order[b.c.status] || a.c.name.localeCompare(b.c.name));
  const count = (s: string) => rows.filter((c) => c.status === s).length;

  return (
    <>
      <header className="o-top">
        <strong>Companies</strong>
      </header>
      <div className="o-page">
        <KpiStrip
          items={[
            { value: String(rows.length), label: 'Companies' },
            { value: String(count('pending')), label: 'Waiting for approval', tone: count('pending') ? 'hivis' : undefined },
            { value: String(count('suspended')), label: 'Blocked' },
            { value: String(people.reduce((n, p) => n + p.length, 0)), label: 'People' },
          ]}
        />
        <div className="o-panel flush">
          <div className="o-scroll">
          <table className="o-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Status</th>
                <th>Stage</th>
                <th className="num">People</th>
                <th className="num">Waiting to join</th>
                <th>Registered</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map(({ c, people: p }) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/super-admin/companies/${c.id}`}>
                      <strong>{c.name}</strong>
                    </Link>
                    <div className="faint" style={{ fontSize: 11 }}>{c.emailDomains.join(', ')}</div>
                  </td>
                  <td>
                    <StatusChip status={companyStatusChip(c.status)} />
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{c.stage}</td>
                  <td className="num">{p.filter((m) => m.status === 'active').length}</td>
                  <td className="num">{p.filter((m) => m.status === 'pending').length || '-'}</td>
                  <td>{fmtDate(c.createdAt)}</td>
                  <td>
                    <form className="o-row" style={{ justifyContent: 'flex-end' }}>
                      {c.status === 'pending' && (
                        <button className="o-btn small ok" formAction={approveCompanyAction.bind(null, c.id)}>
                          Approve
                        </button>
                      )}
                      <Link className="o-btn small" href={`/super-admin/companies/${c.id}`}>
                        View
                      </Link>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {list.length === 0 && <div className="o-empty">No companies yet.</div>}
        </div>
      </div>
    </>
  );
}
