'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { legacyPortal } from '@orbit/core/portals';
import { Button, DataTable, Select, StatusChip, TopBar, useToast } from '@orbit/ui';
import { addMemberAction, changeMemberPortalAction, decideCorrectionAction, updateMemberAction } from '../../actions';
import type { AdminCoverView } from '../../server';
import { AdminCoverPanel } from './AdminCoverPanel';
import type { UserRow, CorrectionRow, PortalAccess } from './types';

// Users, portal access and correction requests.

const ROLES = [
  { value: 'employee', label: 'Employee' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'project_manager', label: 'Project manager' },
  { value: 'company_admin', label: 'Company admin' },
  { value: 'management', label: 'Management (GM / CEO)' },
] as const;

const portalName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, ' ');

/** A person's portals with the company admin's controls: adding needs Orbit approval, removing is immediate. */

function PortalCell({ user, access }: { user: UserRow; access: PortalAccess }) {
  const toast = useToast();
  const router = useRouter();
  if (user.role === 'company_admin' || user.role === 'management') return <span className="faint">All portals</span>;
  const mine = access.rows.filter((r) => r.membershipId === user.membershipId);
  async function change(portal: string, action: 'request' | 'remove' | 'cancel') {
    const res = await changeMemberPortalAction({ membershipId: user.membershipId, portal, action });
    if (!res.ok) return toast(res.error, 'bad');
    toast(
      action === 'request'
        ? `${user.name} can now open ${portalName(portal)}.`
        : `${portalName(portal)} removed for ${user.name}.`,
    );
    router.refresh();
  }
  return (
    <div className="o-stack" style={{ gap: 4 }}>
      {access.company.map((cp) => {
        const row = mine.find((m) => m.portal === cp.portal);
        const status = row ? row.status : mine.length === 0 && cp.enabled && legacyPortal(cp.portal) ? 'active' : 'off';
        return (
          <div key={cp.portal} className="o-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <span className={`o-chip ${status === 'active' ? 'ok' : status === 'requested' ? 'warn' : ''}`}>
              {portalName(cp.portal)}: {status === 'active' ? 'On' : status === 'requested' ? 'Asked for' : 'Off'}
            </span>
            {user.status !== 'disabled' &&
              (status === 'active' ? (
                <Button size="small" onClick={() => change(cp.portal, 'remove')}>
                  Remove
                </Button>
              ) : (
                <Button size="small" variant="ok" onClick={() => change(cp.portal, 'request')}>
                  {status === 'requested' ? 'Approve' : 'Give access'}
                </Button>
              ))}
          </div>
        );
      })}
      {access.company.length === 0 && <span className="faint">No portals yet</span>}
    </div>
  );
}

export function UsersClient({ users, corrections, portals, covers }: { users: UserRow[]; corrections: CorrectionRow[]; portals: PortalAccess; covers?: AdminCoverView }) {
  const toast = useToast();
  const router = useRouter();
  const supervisors = users.filter((u) => u.role !== 'employee' && u.status === 'active');

  const [adding, setAdding] = useState(false);

  async function update(input: Parameters<typeof updateMemberAction>[0]) {
    const res = await updateMemberAction(input);
    if (!res.ok) return toast(res.error, 'bad');
    toast('Saved');
    router.refresh();
  }
  async function correction(id: string, approve: boolean) {
    const res = await decideCorrectionAction({ id, approve });
    if (!res.ok) return toast(res.error, 'bad');
    toast(approve ? 'Week reopened as a new revision.' : 'Request declined.');
    router.refresh();
  }

  return (
    <>
      <TopBar crumbs={['Timesheet', 'Company admin', 'Users']} />
      <div className="o-page">
        <div className="o-row" style={{ justifyContent: 'space-between' }}>
          <h1>Users</h1>
          <Button variant="primary" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Close' : 'Add person'}
          </Button>
        </div>
        {adding && <AddPerson supervisors={supervisors} onDone={() => setAdding(false)} />}
        {covers && <AdminCoverPanel key={JSON.stringify(covers.admins)} view={covers} />}
        {users.some((u) => u.status === 'pending') && (
          <p className="o-panel" style={{ padding: '10px 16px' }}>
            {users.filter((u) => u.status === 'pending').length} people asked to join. Set their role and supervisor, then approve
            them below.
          </p>
        )}
        {corrections.length > 0 && (
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Correction requests</h2>
            </div>
            <DataTable
              rows={corrections}
              rowKey={(c) => c.id}
              columns={[
                { key: 'e', header: 'Employee', render: (c) => c.employee },
                { key: 'w', header: 'Week', num: true, render: (c) => c.week },
                { key: 'r', header: 'Reason', render: (c) => c.reason },
                {
                  key: 'a',
                  header: '',
                  render: (c) => (
                    <div className="o-row" style={{ justifyContent: 'flex-end' }}>
                      <Button size="small" onClick={() => correction(c.id, false)}>
                        Decline
                      </Button>
                      <Button size="small" variant="primary" onClick={() => correction(c.id, true)}>
                        Reopen week
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
        <div className="o-panel flush" style={{ overflowX: 'auto' }}>
          <DataTable
            rows={users}
            rowKey={(u) => u.membershipId}
            columns={[
              {
                key: 'n',
                header: 'Name',
                render: (u) => (
                  <div>
                    <div>{u.name}</div>
                    <div className="faint" style={{ fontSize: 11 }}>{u.email}</div>
                  </div>
                ),
              },
              {
                key: 't',
                header: 'Title',
                render: (u) => (
                  <input
                    className="o-input"
                    defaultValue={u.title ?? ''}
                    onBlur={(e) => e.target.value !== (u.title ?? '') && update({ membershipId: u.membershipId, title: e.target.value || null })}
                  />
                ),
              },
              {
                key: 'r',
                header: 'Role',
                render: (u) => (
                  <Select
                    value={u.role as (typeof ROLES)[number]['value']}
                    options={[...ROLES]}
                    onChange={(role) => update({ membershipId: u.membershipId, role })}
                  />
                ),
              },
              {
                key: 's',
                header: 'Supervisor',
                render: (u) => (
                  <select
                    className="o-select"
                    value={u.supervisorId ?? ''}
                    onChange={(e) => update({ membershipId: u.membershipId, supervisorId: e.target.value || null })}
                  >
                    <option value="">None (company admin approves)</option>
                    {supervisors
                      .filter((s) => s.membershipId !== u.membershipId)
                      .map((s) => (
                        <option key={s.membershipId} value={s.membershipId}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                ),
              },
              { key: 'po', header: 'Portals', render: (u) => <PortalCell user={u} access={portals} /> },
              { key: 'st', header: 'Status', render: (u) => <StatusChip status={u.status} /> },
              {
                key: 'a',
                header: '',
                render: (u) =>
                  u.status === 'pending' ? (
                    <div className="o-row">
                      <Button size="small" variant="ok" onClick={() => update({ membershipId: u.membershipId, status: 'active' })}>
                        Approve
                      </Button>
                      <Button size="small" variant="danger" onClick={() => update({ membershipId: u.membershipId, status: 'disabled' })}>
                        Reject
                      </Button>
                    </div>
                  ) : u.status === 'active' ? (
                    <Button size="small" onClick={() => update({ membershipId: u.membershipId, status: 'disabled' })}>
                      Disable
                    </Button>
                  ) : (
                    <Button size="small" onClick={() => update({ membershipId: u.membershipId, status: 'active' })}>
                      Enable
                    </Button>
                  ),
              },
            ]}
          />
        </div>
      </div>
    </>
  );
}

function AddPerson({ supervisors, onDone }: { supervisors: UserRow[]; onDone: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function submit(form: FormData) {
    setSaving(true);
    const res = await addMemberAction({
      email: String(form.get('email') ?? ''),
      name: String(form.get('name') ?? ''),
      role: form.get('role') as 'employee',
      title: String(form.get('title') ?? ''),
      supervisorId: (form.get('supervisorId') as string) || null,
    });
    setSaving(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast('Added. They can sign in now with that email.');
    onDone();
    router.refresh();
  }

  return (
    <form action={submit} className="o-panel o-stack" style={{ gap: 12 }}>
      <h2 style={{ margin: 0 }}>Add a person</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label className="o-field">
          Full name
          <input className="o-input" name="name" required minLength={2} maxLength={120} />
        </label>
        <label className="o-field">
          Work email
          <input className="o-input" name="email" type="email" required />
        </label>
        <label className="o-field">
          Role
          <select className="o-select" name="role" defaultValue="employee">
            <option value="employee">Employee</option>
            <option value="supervisor">Supervisor</option>
            <option value="project_manager">Project manager</option>
            <option value="company_admin">Company admin</option>
            <option value="management">Management (GM / CEO)</option>
          </select>
        </label>
        <label className="o-field">
          Job title
          <input className="o-input" name="title" maxLength={100} placeholder="Site engineer" />
        </label>
        <label className="o-field">
          Supervisor
          <select className="o-select" name="supervisorId" defaultValue="">
            <option value="">None (company admin approves)</option>
            {supervisors.map((s) => (
              <option key={s.membershipId} value={s.membershipId}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="o-row">
        <Button variant="primary" type="submit" disabled={saving}>
          Add person
        </Button>
        <span className="faint" style={{ fontSize: 12 }}>
          They sign in at the Orbit address with this email. No invite email is sent yet.
        </span>
      </div>
    </form>
  );
}
