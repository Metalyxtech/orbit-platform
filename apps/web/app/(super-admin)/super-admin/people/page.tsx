import Link from 'next/link';
import { StatusChip } from '@orbit/ui';
import { setMemberBlockedAction } from '../actions';
import { ROLE_LABEL, fmtDate, loadCompanies, loadPeople, memberStatusChip, requireSuperAdminPage } from '../data';

const PAGE = 50;

/** Super Admin > People: everyone across companies, searchable and filtered by company, role and status. */
export default async function People({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; company?: string; role?: string; status?: string; page?: string }>;
}) {
  const me = await requireSuperAdminPage();
  const f = await searchParams;
  const companies = await loadCompanies();
  const scoped = f.company ? companies.filter((c) => c.id === f.company) : companies;
  const perCompany = await Promise.all(scoped.map((c) => loadPeople(c.id, me.userId)));
  const q = (f.q ?? '').trim().toLowerCase();
  const all = scoped
    .flatMap((c, i) => perCompany[i].map((p) => ({ ...p, companyId: c.id, company: c.name })))
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    .filter((p) => !f.role || p.role === f.role)
    .filter((p) => !f.status || p.status === f.status);
  const page = Math.max(1, Number(f.page) || 1);
  const shown = all.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const href = (n: number) => `?${new URLSearchParams({ ...f, page: String(n) } as Record<string, string>).toString()}`;

  return (
    <>
      <header className="o-top">
        <strong>People</strong>
      </header>
      <div className="o-page">
        <form className="o-panel o-row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <input className="o-input" style={{ flex: '2 1 220px', width: 'auto' }} name="q" defaultValue={f.q} placeholder="Search name or email" />
          <select className="o-select" style={{ flex: '1 1 160px', width: 'auto' }} name="company" defaultValue={f.company ?? ''}>
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="o-select" style={{ flex: '1 1 140px', width: 'auto' }} name="role" defaultValue={f.role ?? ''}>
            <option value="">All roles</option>
            {Object.entries(ROLE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select className="o-select" style={{ flex: '1 1 140px', width: 'auto' }} name="status" defaultValue={f.status ?? ''}>
            <option value="">All statuses</option>
            <option value="pending">Waiting to join</option>
            <option value="active">Active</option>
            <option value="disabled">Blocked</option>
          </select>
          <button className="o-btn primary" type="submit">
            Filter
          </button>
          <Link className="o-btn" href="/super-admin/people">
            Clear
          </Link>
        </form>

        <div className="o-panel flush">
          <div className="o-scroll">
          <table className="o-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.name}
                    <div className="faint" style={{ fontSize: 11 }}>{m.email}</div>
                  </td>
                  <td>
                    <Link href={`/super-admin/companies/${m.companyId}`}>{m.company}</Link>
                  </td>
                  <td>{ROLE_LABEL[m.role]}</td>
                  <td>
                    <StatusChip status={memberStatusChip(m.status)} />
                  </td>
                  <td>{fmtDate(m.joinedAt)}</td>
                  <td>
                    <form className="o-row" style={{ justifyContent: 'flex-end' }}>
                      {m.status === 'disabled' ? (
                        <button className="o-btn small" formAction={setMemberBlockedAction.bind(null, m.companyId, m.id, false)}>
                          Unblock
                        </button>
                      ) : (
                        <button className="o-btn small danger" formAction={setMemberBlockedAction.bind(null, m.companyId, m.id, true)}>
                          Block
                        </button>
                      )}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {shown.length === 0 && <div className="o-empty">Nobody matches these filters.</div>}
        </div>
        <div className="o-row" style={{ justifyContent: 'space-between' }}>
          <span className="faint" style={{ fontSize: 12 }}>
            {all.length} people{pages > 1 ? `, page ${page} of ${pages}` : ''}
          </span>
          {pages > 1 && (
            <div className="o-row">
              {page > 1 && (
                <Link className="o-btn small" href={href(page - 1)}>
                  Previous
                </Link>
              )}
              {page < pages && (
                <Link className="o-btn small" href={href(page + 1)}>
                  Next
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
