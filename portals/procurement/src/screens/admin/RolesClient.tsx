'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Chip, TopBar, useConfirm } from '@orbit/ui';
import { setAdminCoversAction, setPurchaseRoleAction } from '../../actions';
import { PROC_ROLES, roleLabel, type ProcRole } from '../../config';
import type { TeamMember } from '../../server';
import { useSave } from './useSave';

/** Admin > Purchase roles: who does what in the purchase workflow. */
export function RolesClient({ team, needed }: { team: TeamMember[]; needed: ProcRole[] }) {
  const { busy, save } = useSave();
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState(team);
  useEffect(() => setRows(team), [team]);
  const withAccess = rows.filter((m) => m.access === 'on');
  const [covers, setCovers] = useState<Record<string, ProcRole[]>>(() => Object.fromEntries(team.map((m) => [m.membershipId, m.covers])));
  useEffect(() => setCovers(Object.fromEntries(team.map((m) => [m.membershipId, m.covers]))), [team]);
  function change(m: TeamMember, role: ProcRole) {
    confirm({
      title: `Make ${m.name} ${roleLabel(role).toLowerCase()}?`,
      body: `${m.name} will see the ${roleLabel(role).toLowerCase()} menu and get its approvals and tasks instead of ${roleLabel(m.purchaseRole).toLowerCase()}.`,
      label: 'Change role',
      run: () => void save(() => setPurchaseRoleAction({ membershipId: m.membershipId, role }), `${m.name} is now ${roleLabel(role).toLowerCase()}.`),
    });
  }
  function saveCovers(m: TeamMember) {
    const roles = covers[m.membershipId] ?? [];
    confirm({
      title: `Save the roles ${m.name} covers?`,
      body: roles.length
        ? `${m.name} will also get the approvals and tasks of: ${roles.map(roleLabel).join(', ')}. Other steps stay with their owners.`
        : `${m.name} will not act on any workflow step; only purchase settings.`,
      label: 'Save',
      run: () => void save(() => setAdminCoversAction({ membershipId: m.membershipId, roles }), 'Saved.'),
    });
  }
  const coverChanged = (m: TeamMember) => JSON.stringify([...(covers[m.membershipId] ?? [])].sort()) !== JSON.stringify([...m.covers].sort());
  return (
    <>
      <TopBar crumbs={['Purchase', 'Admin', 'Purchase roles']} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Purchase roles</h1>
            <p>
              A person&apos;s purchase role decides their menu and which workflow steps they act on. A purchase admin can also cover roles nobody holds;
              they then get only those roles&apos; approvals and tasks.
            </p>
          </div>
          <Link className="o-btn" href="/manage/company/people">
            People and portals
          </Link>
        </div>
        <div className="o-panel">
          <h2>Coverage</h2>
          <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
            Every role your workflow uses needs at least one person with Purchase access.
          </p>
          <div className="o-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {PROC_ROLES.map((r) => {
              const n = withAccess.filter((m) => m.purchaseRole === r.id || m.covers.includes(r.id)).length;
              const need = needed.includes(r.id);
              return (
                <Chip key={r.id} tone={n ? 'ok' : need ? 'bad' : 'grey'}>
                  {r.label} · {n}
                  {!n && need ? ' (needed)' : ''}
                </Chip>
              );
            })}
          </div>
        </div>
        <div className="o-panel flush">
          <div className="o-scroll">
            <table className="o-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Purchase access</th>
                  <th>Purchase role</th>
                  <th>What they do</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.membershipId}>
                    <td>
                      <strong>{m.name}</strong>
                      <div className="faint" style={{ fontSize: 11 }}>
                        {m.email}
                        {m.title ? ` · ${m.title}` : ''}
                      </div>
                    </td>
                    <td>
                      <Chip tone={m.access === 'on' ? 'ok' : m.access === 'requested' ? 'warn' : 'grey'}>{m.access === 'on' ? 'On' : m.access === 'requested' ? 'Waiting for Orbit' : 'No access'}</Chip>
                    </td>
                    <td style={{ minWidth: 190 }}>
                      {m.companyRole === 'company_admin' ? (
                        <div className="o-stack" style={{ gap: 6 }}>
                          <span className="muted">Purchase admin</span>
                          <span className="faint" style={{ fontSize: 11 }}>
                            Also covers (gets only these roles' approvals and tasks):
                          </span>
                          <div className="p-covers">
                            {PROC_ROLES.filter((r) => r.id !== 'admin').map((r) => {
                              const on = (covers[m.membershipId] ?? []).includes(r.id);
                              const nobody = !withAccess.some((x) => x.purchaseRole === r.id);
                              return (
                                <label key={r.id} className={on ? 'on' : undefined} title={nobody ? 'Nobody holds this role yet' : undefined}>
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={(e) =>
                                      setCovers((c) => ({
                                        ...c,
                                        [m.membershipId]: e.target.checked ? [...(c[m.membershipId] ?? []), r.id] : (c[m.membershipId] ?? []).filter((x) => x !== r.id),
                                      }))
                                    }
                                  />
                                  {r.label}
                                  {nobody && <em>nobody</em>}
                                </label>
                              );
                            })}
                          </div>
                          {coverChanged(m) && (
                            <div className="o-row" style={{ gap: 6 }}>
                              <Button size="small" variant="primary" disabled={busy} onClick={() => saveCovers(m)}>
                                Save
                              </Button>
                              <Button size="small" onClick={() => setCovers((c) => ({ ...c, [m.membershipId]: m.covers }))}>
                                Discard
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <select className="o-select" value={m.purchaseRole} disabled={busy} onChange={(e) => change(m, e.target.value as ProcRole)} aria-label={`Purchase role for ${m.name}`}>
                          {PROC_ROLES.filter((r) => r.id !== 'admin').map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {PROC_ROLES.find((r) => r.id === m.purchaseRole)?.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {dialog}
    </>
  );
}
