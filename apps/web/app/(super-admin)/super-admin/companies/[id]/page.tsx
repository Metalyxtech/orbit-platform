import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getDb } from '@orbit/core/next';
import { companies, companyPortals, withTenant, workflowDefinitions } from '@orbit/db';
import { StatusChip } from '@orbit/ui';
import {
  approveCompanyAction,
  resetSandboxAction,
  setCompanyBlockedAction,
  setMemberBlockedAction,
  setStageAction,
} from '../../actions';
import { ROLE_LABEL, companyStatusChip, fmtDate, loadPeople, memberStatusChip, requireSuperAdminPage } from '../../data';

/** Super Admin > Companies > one company: profile, portals and people. */
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSuperAdminPage();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const db = await getDb();
  const [c] = await db.select().from(companies).where(eq(companies.id, id.data));
  if (!c) notFound();
  const people = await loadPeople(c.id, me.userId);
  const portals = await withTenant(db, { companyId: c.id, userId: me.userId }, (tx) =>
    tx
      .select({ portal: companyPortals.portal, enabled: companyPortals.enabled, workflow: workflowDefinitions.name, version: workflowDefinitions.version })
      .from(companyPortals)
      .leftJoin(workflowDefinitions, eq(workflowDefinitions.id, companyPortals.workflowDefinitionId))
      .where(eq(companyPortals.companyId, c.id)),
  );
  const admins = people.filter((p) => p.role === 'company_admin');
  const registeredBy = [...admins].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
  const active = people.filter((p) => p.status === 'active');

  const details: [string, React.ReactNode][] = [
    ['Company name', c.name],
    ['Status', <StatusChip key="s" status={companyStatusChip(c.status)} />],
    ['Stage', <span key="st" style={{ textTransform: 'capitalize' }}>{c.stage}</span>],
    ['Email domains', c.emailDomains.join(', ') || '-'],
    ['Time zone', c.timezone],
    ['Data region', c.region],
    ['Registered on', fmtDate(c.createdAt)],
    ['Registered by', registeredBy ? `${registeredBy.name} (${registeredBy.email})` : '-'],
    ['Company ID', <code key="id" style={{ fontSize: 12 }}>{c.id}</code>],
    ['Short name (slug)', <code key="slug" style={{ fontSize: 12 }}>{c.slug}</code>],
    ['WorkOS organisation', c.workosOrgId ?? 'Not linked'],
  ];

  return (
    <>
      <header className="o-top">
        <span className="faint">
          <Link href="/super-admin">Companies</Link> /
        </span>
        <strong style={{ flex: 1 }}>{c.name}</strong>
        <form className="o-row">
          {c.status === 'pending' && (
            <button className="o-btn small ok" formAction={approveCompanyAction.bind(null, c.id)}>
              Approve company
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
      </header>
      <div className="o-page">
        {c.status === 'suspended' && <div className="o-banner bad">This company is blocked. Its people see "Access blocked" when they sign in.</div>}
        {c.status === 'pending' && <div className="o-banner">This company is waiting for your approval. Approving it activates its first admin and the Timesheet portal.</div>}

        <div className="o-split">
          <div className="o-panel">
            <div className="o-panel-head">
              <h2>Company details</h2>
            </div>
            <dl className="o-dl">
              {details.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="o-stack" style={{ gap: 16 }}>
            <div className="o-panel">
              <div className="o-panel-head">
                <h2>Stage</h2>
              </div>
              <form className="o-row">
                {(['sandbox', 'pilot', 'live'] as const).map((st) => (
                  <button key={st} className={`o-btn small ${c.stage === st ? 'primary' : ''}`} formAction={setStageAction.bind(null, c.id, st)}>
                    {st}
                  </button>
                ))}
              </form>
              <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
                Sandbox only emails verified test addresses and can be reset.
              </p>
            </div>
            <div className="o-panel">
              <div className="o-panel-head">
                <h2>People</h2>
              </div>
              <dl className="o-dl two">
                {Object.entries(ROLE_LABEL).map(([role, label]) => (
                  <div key={role}>
                    <dt>{label}s</dt>
                    <dd>{active.filter((p) => p.role === role).length}</dd>
                  </div>
                ))}
                <div>
                  <dt>Waiting to join</dt>
                  <dd>{people.filter((p) => p.status === 'pending').length}</dd>
                </div>
                <div>
                  <dt>Blocked</dt>
                  <dd>{people.filter((p) => p.status === 'disabled').length}</dd>
                </div>
              </dl>
            </div>
            <div className="o-panel">
              <div className="o-panel-head">
                <h2>Portals</h2>
              </div>
              {portals.length === 0 ? (
                <p className="faint" style={{ margin: 0 }}>No portals yet. They are switched on when the company is approved.</p>
              ) : (
                <dl className="o-dl">
                  {portals.map((p) => (
                    <div key={p.portal}>
                      <dt style={{ textTransform: 'capitalize' }}>{p.portal}</dt>
                      <dd>
                        {p.enabled ? 'On' : 'Off'}
                        {p.workflow && <div className="faint" style={{ fontSize: 12 }}>{p.workflow} (v{p.version})</div>}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        </div>

        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>
              People <span className="faint" style={{ fontSize: 12, fontWeight: 400 }}>{people.length}</span>
            </h2>
          </div>
          <div className="o-scroll">
          <table className="o-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {people.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.name}
                    {m.title && <div className="faint" style={{ fontSize: 11 }}>{m.title}</div>}
                  </td>
                  <td>{m.email}</td>
                  <td>{ROLE_LABEL[m.role]}</td>
                  <td>
                    <StatusChip status={memberStatusChip(m.status)} />
                  </td>
                  <td>{fmtDate(m.joinedAt)}</td>
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
          {people.length === 0 && <div className="o-empty">Nobody has joined yet.</div>}
        </div>
      </div>
    </>
  );
}
