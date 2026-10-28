import { asc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb, getSession } from '@orbit/core/next';
import { companies } from '@orbit/db';
import { StatusChip } from '@orbit/ui';
import { approveCompanyAction, resetSandboxAction, setStageAction } from './actions';

export const dynamic = 'force-dynamic';

/** Super Admin portal (first slice). */
export default async function SuperAdmin() {
  const s = await getSession();
  const isSuper = (s.state === 'ok' && s.ctx.isSuperAdmin) || ((s.state === 'no_company' || s.state === 'pending') && s.isSuperAdmin);
  if (!isSuper) redirect('/');
  const rows = await (await getDb()).select().from(companies).orderBy(asc(companies.status), asc(companies.name));

  return (
    <div className="o-shell" style={{ gridTemplateColumns: '1fr' }}>
      <div className="o-main">
        <header className="o-top" style={{ background: 'var(--graphite)', color: '#fff' }}>
          <strong style={{ flex: 1 }}>Orbit / Super Admin</strong>
          <a href="/" style={{ color: '#c9cfd5' }}>
            Back to portals
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
                      <StatusChip status={c.status === 'suspended' ? 'disabled' : c.status} />
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
        </div>
      </div>
    </div>
  );
}
