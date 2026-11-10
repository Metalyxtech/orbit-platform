import { asc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb, getSession } from '@orbit/core/next';
import { companies } from '@orbit/db';
import { StatusChip } from '@orbit/ui';
import { approveCompanyAction, resetSandboxAction, setStageAction } from './actions';
import { ResetButton } from './ResetButton';

export const dynamic = 'force-dynamic';

/** Super Admin portal (first slice). */
export default async function SuperAdmin() {
  const s = await getSession();
  const isSuper = (s.state === 'ok' && s.ctx.isSuperAdmin) || ((s.state === 'no_company' || s.state === 'pending') && s.isSuperAdmin);
  if (!isSuper) redirect('/');
  const rows = await (await getDb()).select().from(companies).orderBy(asc(companies.status), asc(companies.name));

  const waiting = rows.filter((c) => c.status === 'pending').length;

  return (
    <div className="o-main" style={{ minHeight: '100vh' }}>
      <header className="o-top" style={{ background: 'var(--graphite)', borderColor: 'var(--graphite)', color: '#fff' }}>
        <div className="o-brand" style={{ padding: 0, flex: 1 }}>
          <div className="o-brand-mark" aria-hidden />
          <div className="o-brand-name">Orbit</div>
          <span className="o-chip hivis">Super Admin</span>
        </div>
        <a className="o-btn small ghost" style={{ color: '#cfd5da' }} href="/">
          Back to portals
        </a>
        <form action="/auth/sign-out" method="post">
          <button className="o-btn small ghost" style={{ color: '#cfd5da' }} type="submit">
            Sign out
          </button>
        </form>
      </header>
      <div className="o-page" style={{ margin: '0 auto' }}>
        <div>
          <h1>Companies</h1>
          <p className="o-page-sub">
            {rows.length} {rows.length === 1 ? 'company' : 'companies'}
            {waiting ? `, ${waiting} waiting for approval` : ''}. Stage controls who receives real email: sandbox companies only reach verified test addresses.
          </p>
        </div>
        <div className="o-panel flush o-scroll">
          <table className="o-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Status</th>
                <th>Stage</th>
                <th>Time zone</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="o-empty">No companies have registered yet.</div>
                  </td>
                </tr>
              )}
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong style={{ fontWeight: 500 }}>{c.name}</strong>
                    <div className="sub">{c.emailDomains.join(', ')}</div>
                  </td>
                  <td>
                    <StatusChip status={c.status} />
                  </td>
                  <td>
                    <form className="o-seg" role="group" aria-label={`Stage for ${c.name}`}>
                      {(['sandbox', 'pilot', 'live'] as const).map((st) => (
                        <button key={st} aria-pressed={c.stage === st} formAction={setStageAction.bind(null, c.id, st)}>
                          {st[0].toUpperCase() + st.slice(1)}
                        </button>
                      ))}
                    </form>
                  </td>
                  <td className="muted">{c.timezone}</td>
                  <td>
                    <div className="o-row" style={{ justifyContent: 'flex-end' }}>
                      {c.status === 'pending' && (
                        <form>
                          <button className="o-btn small ok" formAction={approveCompanyAction.bind(null, c.id)}>
                            Approve
                          </button>
                        </form>
                      )}
                      {c.stage === 'sandbox' && c.status === 'active' && (
                        <ResetButton companyName={c.name} action={resetSandboxAction.bind(null, c.id)} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
