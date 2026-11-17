import Link from 'next/link';
import { approveCompanyAction, approveMemberAction, declineCompanyPortalAction, setMemberBlockedAction, setMemberPortalAction, setPortalEnabledAction } from '../actions';
import { ROLE_LABEL, fmtDate, loadRequests, requireSuperAdminPage } from '../data';

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="o-panel flush">
      <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
        <h2>
          {title} <span className="faint" style={{ fontSize: 12, fontWeight: 400 }}>{count}</span>
        </h2>
      </div>
      {count === 0 ? <div className="o-empty" style={{ padding: 20 }}>Nothing waiting.</div> : <div className="o-scroll">{children}</div>}
    </div>
  );
}

/** Super Admin > Requests: one queue for everything that needs Orbit's approval. */
export default async function Requests() {
  const me = await requireSuperAdminPage();
  const r = await loadRequests(me.userId);
  return (
    <>
      <header className="o-top">
        <strong>Requests</strong>
        <span className="faint" style={{ fontSize: 12 }}>{r.total ? `${r.total} waiting for you` : 'All caught up'}</span>
      </header>
      <div className="o-page">
        <Section title="Portal access for people" count={r.portals.length}>
          <table className="o-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Company</th>
                <th>Portal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {r.portals.map((p) => (
                <tr key={`${p.membershipId}:${p.portal}`}>
                  <td>
                    {p.person}
                    <div className="faint" style={{ fontSize: 11 }}>{p.email}</div>
                  </td>
                  <td>
                    <Link href={`/super-admin/companies/${p.companyId}`}>{p.company}</Link>
                  </td>
                  <td>
                    {p.name}
                    {!p.companyPortalOn && <div className="faint" style={{ fontSize: 11 }}>Company portal is not on yet</div>}
                  </td>
                  <td>
                    <form className="o-row" style={{ justifyContent: 'flex-end' }}>
                      <button className="o-btn small ok" formAction={setMemberPortalAction.bind(null, p.companyId, p.membershipId, p.portal, true)}>
                        Approve
                      </button>
                      <button className="o-btn small" formAction={setMemberPortalAction.bind(null, p.companyId, p.membershipId, p.portal, false)}>
                        Decline
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="People waiting to join" count={r.people.length}>
          <table className="o-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Company</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {r.people.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    <div className="faint" style={{ fontSize: 11 }}>{p.email}</div>
                  </td>
                  <td>
                    <Link href={`/super-admin/companies/${p.companyId}`}>{p.company}</Link>
                  </td>
                  <td>
                    {ROLE_LABEL[p.role]}
                    {p.title && <div className="faint" style={{ fontSize: 11 }}>{p.title}</div>}
                  </td>
                  <td>
                    <form className="o-row" style={{ justifyContent: 'flex-end' }}>
                      <button className="o-btn small ok" formAction={approveMemberAction.bind(null, p.companyId, p.id)}>
                        Approve
                      </button>
                      <button className="o-btn small" formAction={setMemberBlockedAction.bind(null, p.companyId, p.id, true)}>
                        Decline
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Portals requested by companies" count={r.companyPortals.length}>
          <table className="o-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Portal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {r.companyPortals.map((p) => (
                <tr key={`${p.companyId}:${p.portal}`}>
                  <td>
                    <Link href={`/super-admin/companies/${p.companyId}`}>{p.company}</Link>
                  </td>
                  <td>{p.name}</td>
                  <td>
                    <form className="o-row" style={{ justifyContent: 'flex-end' }}>
                      <button className="o-btn small ok" formAction={setPortalEnabledAction.bind(null, p.companyId, p.portal, true)}>
                        Approve
                      </button>
                      <button className="o-btn small" formAction={declineCompanyPortalAction.bind(null, p.companyId, p.portal)}>
                        Decline
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="New companies" count={r.companies.length}>
          <table className="o-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Registered</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {r.companies.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/super-admin/companies/${c.id}`}>
                      <strong>{c.name}</strong>
                    </Link>
                    <div className="faint" style={{ fontSize: 11 }}>{c.emailDomains.join(', ')}</div>
                  </td>
                  <td>{fmtDate(c.createdAt)}</td>
                  <td>
                    <form className="o-row" style={{ justifyContent: 'flex-end' }}>
                      <button className="o-btn small ok" formAction={approveCompanyAction.bind(null, c.id)}>
                        Approve company
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </>
  );
}
