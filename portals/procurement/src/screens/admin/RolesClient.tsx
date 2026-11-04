'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Chip, TopBar } from '@orbit/ui';
import { setPurchaseRoleAction } from '../../actions';
import { PROC_ROLES, roleLabel, type ProcRole } from '../../config';
import type { TeamMember } from '../../server';
import { useSave } from './useSave';

/** Admin > Purchase roles: who does what in the purchase workflow. */
export function RolesClient({ team, needed }: { team: TeamMember[]; needed: ProcRole[] }) {
  const { busy, save } = useSave();
  const [rows, setRows] = useState(team);
  const withAccess = rows.filter((m) => m.access === 'on');
  async function change(m: TeamMember, role: ProcRole) {
    const before = rows;
    setRows((rs) => rs.map((r) => (r.membershipId === m.membershipId ? { ...r, purchaseRole: role } : r)));
    const ok = await save(() => setPurchaseRoleAction({ membershipId: m.membershipId, role }), `${m.name} is now ${roleLabel(role).toLowerCase()}.`);
    if (!ok) setRows(before);
  }
  return (
    <>
      <TopBar crumbs={['Purchase', 'Admin', 'Purchase roles']} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Purchase roles</h1>
            <p>A person&apos;s purchase role decides their menu and which workflow steps they act on. Portal access is managed in People and portals.</p>
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
              const n = withAccess.filter((m) => m.purchaseRole === r.id).length;
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
                        <span className="muted">Purchase admin (company admin)</span>
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
    </>
  );
}
