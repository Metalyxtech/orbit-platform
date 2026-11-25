import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getDb } from '@orbit/core/next';
import { companies, companyPortals, withTenant, workflowDefinitions } from '@orbit/db';
import { StatusChip } from '@orbit/ui';
import {
  approveCompanyAction,
  approveMemberAction,
  setPortalEnabledAction,
  resetSandboxAction,
  setCompanyBlockedAction,
  setMemberBlockedAction,
  setStageAction,
} from '../../actions';
import { ROLE_LABEL, companyStatusChip, fmtDate, loadMemberPortals, loadPeople, loadPortals, memberStatusChip, requireSuperAdminPage } from '../../data';
import { RemoveMemberButton } from '../../RemoveMemberButton';
import { ResetButton } from '../../ResetButton';
import { MemberPortals } from '../../MemberPortals';
import { loadCompanyBilling } from '../../billing-data';
import { BillingPanel } from './BillingPanel';
import { CustomPanel } from './CustomPanel';
import { companyCustomWork } from '../../custom-data';
import { addCompanyAdminAction } from '../../billing-actions';
import { MAX_COMPANY_ADMINS } from '../../new-company';

/** Super Admin > Companies > one company: profile, portals and people. */
export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ added?: string; adminAdded?: string; adminError?: string }> }) {
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
  const portalStates = await loadPortals(c.id, me.userId);
  const memberPortalRows = await loadMemberPortals(c.id, me.userId, people.map((p) => p.id));
  const admins = people.filter((p) => p.role === 'company_admin');
  const registeredBy = [...admins].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
  const active = people.filter((p) => p.status === 'active');
  const billing = await loadCompanyBilling(c.id, me.userId);
  // Before migration 0015 the custom tables are missing: the panel is simply left out.
  const custom = await companyCustomWork(c.id, me.userId).catch(() => null);
  const sp = await searchParams;
  const added = sp.added === '1';
  const currentAdmins = admins; // loadPeople already leaves out removed people

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
            <ResetButton companyName={c.name} action={resetSandboxAction.bind(null, c.id)} />
          )}
        </form>
      </header>
      <div className="o-page">
        {added && (
          <div className="o-banner ok">
            {c.name} is set up.{' '}
            {admins.length ? `${admins.map((a) => `${a.name} (${a.email})`).join(' and ')} can now sign in and will open the Company admin portal.` : ''}
          </div>
        )}
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
                <h2>
                  Company admins{' '}
                  <span className="faint" style={{ fontSize: 12, fontWeight: 400 }}>
                    {currentAdmins.length} of {MAX_COMPANY_ADMINS}
                  </span>
                </h2>
              </div>
              {sp.adminAdded === '1' && <div className="o-banner ok">Admin added. They can sign in with their email and have the same access as the other admin.</div>}
              {sp.adminError && (
                <div className="o-banner bad" role="alert">
                  {sp.adminError}
                </div>
              )}
              <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
                {currentAdmins.map((a) => (
                  <li key={a.id}>
                    {a.name} <span className="faint">({a.email})</span>
                  </li>
                ))}
                {currentAdmins.length === 0 && <li className="faint">No company admin yet</li>}
              </ul>
              {currentAdmins.length < MAX_COMPANY_ADMINS ? (
                <form action={addCompanyAdminAction.bind(null, c.id)} className="o-stack" style={{ gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                    <label className="o-field">
                      Name
                      <input className="o-input" name="name" required minLength={2} maxLength={120} />
                    </label>
                    <label className="o-field">
                      Email
                      <input className="o-input" name="email" type="email" required maxLength={200} />
                    </label>
                    <label className="o-field">
                      Job title
                      <input className="o-input" name="title" maxLength={100} placeholder="Company admin" />
                    </label>
                  </div>
                  <div className="o-row" style={{ justifyContent: 'flex-end' }}>
                    <button className="o-btn small primary" type="submit">
                      Add admin
                    </button>
                  </div>
                  <p className="faint" style={{ fontSize: 12, margin: 0 }}>
                    Both admins have the same access. Someone already in the company is promoted to admin.
                  </p>
                </form>
              ) : (
                <p className="faint" style={{ fontSize: 12, margin: 0 }}>
                  This company has the maximum of {MAX_COMPANY_ADMINS} admins. Remove one to add another.
                </p>
              )}
            </div>
            <BillingPanel companyId={c.id} b={billing} />
            {custom && <CustomPanel companyId={c.id} plan={custom.plan} requests={custom.requests} currency={billing.settings.currency} />}
            <div className="o-panel">
              <div className="o-panel-head">
                <h2>Stage</h2>
              </div>
              <form className="o-seg" role="group" aria-label="Stage">
                {(['sandbox', 'pilot', 'live'] as const).map((st) => (
                  <button key={st} aria-pressed={c.stage === st} formAction={setStageAction.bind(null, c.id, st)}>
                    {st[0].toUpperCase() + st.slice(1)}
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
                    <dt>{label === 'Management' ? label : `${label}s`}</dt>
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
              <div className="o-stack" style={{ gap: 10 }}>
                {portalStates.map((p) => {
                  const wf = portals.find((x) => x.portal === p.id);
                  return (
                    <form key={p.id} className="o-row" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <strong>{p.name}</strong>{' '}
                        <span className={`o-chip ${p.state === 'on' ? 'ok' : p.state === 'requested' ? 'warn' : ''}`}>
                          {p.state === 'on' ? 'On' : p.state === 'requested' ? 'Requested' : 'Not requested'}
                        </span>
                        {wf?.workflow && p.state === 'on' && <div className="faint" style={{ fontSize: 12 }}>{wf.workflow} (v{wf.version})</div>}
                      </div>
                      {p.state === 'on' ? (
                        <button className="o-btn small" formAction={setPortalEnabledAction.bind(null, c.id, p.id, false)}>
                          Turn off
                        </button>
                      ) : (
                        <button className="o-btn small ok" formAction={setPortalEnabledAction.bind(null, c.id, p.id, true)}>
                          {p.state === 'requested' ? 'Approve' : 'Turn on'}
                        </button>
                      )}
                    </form>
                  );
                })}
              </div>
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
                <th>Portals</th>
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
                    <MemberPortals
                      companyId={c.id}
                      membershipId={m.id}
                      role={m.role}
                      memberStatus={m.status}
                      companyPortals={portalStates}
                      rows={memberPortalRows}
                    />
                  </td>
                  <td>
                    <StatusChip status={memberStatusChip(m.status)} />
                  </td>
                  <td>{fmtDate(m.joinedAt)}</td>
                  <td>
                    <form className="o-row" style={{ justifyContent: 'flex-end' }}>
                      {m.status === 'pending' && c.status === 'active' && (
                        <button className="o-btn small ok" formAction={approveMemberAction.bind(null, c.id, m.id)}>
                          Approve
                        </button>
                      )}
                      {m.status === 'disabled' ? (
                        <button className="o-btn small" formAction={setMemberBlockedAction.bind(null, c.id, m.id, false)}>
                          Unblock
                        </button>
                      ) : (
                        <button className="o-btn small danger" formAction={setMemberBlockedAction.bind(null, c.id, m.id, true)}>
                          Block
                        </button>
                      )}
                      <RemoveMemberButton companyId={c.id} membershipId={m.id} name={m.name} company={c.name} />
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
