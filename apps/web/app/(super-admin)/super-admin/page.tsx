import { asc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb, getSession } from '@orbit/core/next';
import { companies, memberships, users, withTenant } from '@orbit/db';
import { StatusChip } from '@orbit/ui';
import { approveCompanyAction, resetSandboxAction, setCompanyBlockedAction, setMemberBlockedAction, setStageAction } from './actions';

export const dynamic = 'force-dynamic';

/** Super Admin portal (first slice). */
export default async function SuperAdmin() {
  const s = await getSession();
  const isSuper = (s.state === 'ok' && s.ctx.isSuperAdmin) || ((s.state === 'no_company' || s.state === 'pending') && s.isSuperAdmin);
  if (!isSuper) redirect('/');
  const db = await getDb();
  const rows = await db.select().from(companies).orderBy(asc(companies.status), asc(companies.name));
  const superUserId = s.state === 'ok' ? s.ctx.userId : s.state === 'no_company' ? s.userId : '00000000-0000-0000-0000-000000000000';
  // memberships is tenant data: read each company inside its own RLS scope.
  const people = await Promise.all(
    rows.map((c) =>
      withTenant(db, { companyId: c.id, userId: superUserId }, (tx) =>
        tx
          .select({ id: memberships.id, name: users.name, email: users.email, role: memberships.role, status: memberships.status })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(eq(memberships.companyId, c.id))
          .orderBy(asc(memberships.role), asc(users.name)),
      ),
    ),
  );

  return (
    <div className="o-shell" style={{ gridTemplateColumns: '1fr' }}>
      <div className="o-main">
        <header className="o-top" style={{ background: 'var(--graphite)', color: '#fff' }}>
          <strong style={{ flex: 1 }}>Orbit / Super Admin</strong>
          {s.state === 'ok' && (
            <a href="/" style={{ color: '#c9cfd5' }}>
              Back to portals
            </a>
          )}
          <a href="/auth/sign-out" style={{ color: '#c9cfd5', marginLeft: 20 }}>
            Sign out
          </a>
        </header>
        <div className="o-page">
          <h1>Companies</h1>
          <div className="o-panel flush">
            <table className="o-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Stage</th>
                  <th>Time zone</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="faint" style={{ fontSize: 11 }}>{c.emailDomains.join(', ')}</div>
                    </td>
                    <td>
                      <StatusChip status={c.status === 'suspended' ? 'blocked' : c.status} />
                    </td>
                    <td>
                      <form className="o-row">
                        {(['sandbox', 'pilot', 'live'] as const).map((st) => (
                          <button
                            key={st}
                            className={`o-btn small ${c.stage === st ? 'primary' : ''}`}
                            formAction={setStageAction.bind(null, c.id, st)}
                          >
                            {st}
                          </button>
                        ))}
                      </form>
                    </td>
                    <td>{c.timezone}</td>
                    <td>
                      <form className="o-row" style={{ justifyContent: 'flex-end' }}>
                        {c.status === 'pending' && (
                          <button className="o-btn small ok" formAction={approveCompanyAction.bind(null, c.id)}>
                            Approve
                          </button>
                        )}
                        {c.status === 'active' && (
                          <button className="o-btn small danger" formAction={setCompanyBlockedAction.bind(null, c.id, true)}>
                            Block company
                          </button>
                        )}
                        {c.status === 'suspended' && (
                          <button className="o-btn small ok" formAction={setCompanyBlockedAction.bind(null, c.id, false)}>
                            Unblock company
                          </button>
                        )}
                        {c.stage === 'sandbox' && c.status === 'active' && (
                          <button className="o-btn small danger" formAction={resetSandboxAction.bind(null, c.id)}>
                            Reset sandbox data
                          </button>
                        )}
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h1 style={{ marginTop: 32 }}>People</h1>
          {rows.map((c, i) => (
            <div key={c.id} className="o-panel flush" style={{ marginBottom: 16 }}>
              <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                <h2>
                  {c.name} <span className="faint" style={{ fontSize: 12, fontWeight: 400 }}>{people[i].length} people</span>
                </h2>
              </div>
              <table className="o-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {people[i].map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{m.email}</td>
                      <td>{m.role.replace('_', ' ')}</td>
                      <td>
                        <StatusChip status={m.status === 'disabled' ? 'blocked' : m.status} />
                      </td>
                      <td>
                        <form className="o-row" style={{ justifyContent: 'flex-end' }}>
                          {m.status === 'disabled' ? (
                            <button className="o-btn small" formAction={setMemberBlockedAction.bind(null, c.id, m.id, false)}>
                              Unblock
                            </button>
                          ) : (
                            <button className="o-btn small danger" formAction={setMemberBlockedAction.bind(null, c.id, m.id, true)}>
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
          ))}
        </div>
      </div>
    </div>
  );
}
