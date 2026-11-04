'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Chip, useToast } from '@orbit/ui';
import type { PeopleData } from '@/company-admin/people';
import { addPersonAction, changePersonPortalAction, setPersonPortalRoleAction } from '../actions';

const ROLE_LABEL: Record<string, string> = {
  employee: 'Employee',
  supervisor: 'Supervisor',
  project_manager: 'Project manager',
  management: 'Management (GM, CEO, director)',
  company_admin: 'Company admin',
};

type Person = PeopleData['people'][number];

export function PeopleClient({ data, me }: { data: PeopleData; me: string }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const name = (p: string) => data.portals.find((x) => x.id === p)?.name ?? p;
  const rows = data.people.filter((p) => !q || `${p.name} ${p.email} ${p.title ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  async function change(p: Person, portal: string, action: 'grant' | 'remove') {
    const res = await changePersonPortalAction({ membershipId: p.membershipId, portal, action });
    if (!res.ok) return toast(res.error, 'bad');
    toast(action === 'grant' ? `${p.name} can now open ${name(portal)}.` : `${name(portal)} removed for ${p.name}.`);
    router.refresh();
  }
  async function setRole(p: Person, portal: string, role: string) {
    const res = await setPersonPortalRoleAction({ membershipId: p.membershipId, portal, role });
    if (!res.ok) return toast(res.error, 'bad');
    toast(`${p.name}: ${name(portal)} role saved.`);
    router.refresh();
  }

  return (
    <div className="o-page">
      <div className="o-page-head">
        <div>
          <h1>People and portals</h1>
          <p>Give each person the portals your company has, and their role inside each. Changes apply straight away. New portals for the company are requested in Company portals.</p>
        </div>
        <div className="o-row">
          <Link className="o-btn" href="/manage/company/portals">
            Company portals
          </Link>
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add person
          </Button>
        </div>
      </div>
      {adding && <AddPerson portals={data.portals} onDone={() => setAdding(false)} />}
      <div className="o-row">
        <input className="o-input" style={{ maxWidth: 320 }} placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
        <span className="faint" style={{ fontSize: 12 }}>
          {rows.length} people
        </span>
      </div>
      <div className="o-panel flush">
        <div className="o-scroll">
          <table className="o-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Company role</th>
                {data.portals.map((p) => (
                  <th key={p.id}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.membershipId}>
                  <td>
                    <strong>{p.name}</strong>
                    {p.membershipId === me && <span className="faint"> (you)</span>}
                    <div className="faint" style={{ fontSize: 11 }}>
                      {p.email}
                      {p.title ? ` · ${p.title}` : ''}
                    </div>
                    {p.status !== 'active' && <Chip tone={p.status === 'pending' ? 'warn' : 'bad'}>{p.status === 'pending' ? 'Waiting to join' : 'Blocked'}</Chip>}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {ROLE_LABEL[p.role] ?? p.role}
                  </td>
                  {data.portals.map((portal) => {
                    const a = p.access[portal.id];
                    const all = p.role === 'company_admin' || p.role === 'management';
                    return (
                      <td key={portal.id} style={{ minWidth: 190 }}>
                        <div className="o-stack" style={{ gap: 6 }}>
                          <div className="o-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                            <Chip tone={a === 'on' ? 'ok' : a === 'requested' ? 'warn' : 'grey'}>{a === 'on' ? 'On' : a === 'requested' ? 'Asked for' : 'Off'}</Chip>
                            {!all && p.status !== 'disabled' && (
                              <Button size="small" variant={a === 'on' ? undefined : 'ok'} onClick={() => change(p, portal.id, a === 'on' ? 'remove' : 'grant')}>
                                {a === 'on' ? 'Remove' : a === 'requested' ? 'Approve' : 'Give access'}
                              </Button>
                            )}
                          </div>
                          {portal.roles && a !== 'off' && (
                            p.role === 'company_admin' ? (
                              <span className="faint" style={{ fontSize: 11 }}>Admin</span>
                            ) : (
                              <select className="o-select" style={{ fontSize: 12, padding: '4px 6px' }} value={p.portalRole[portal.id] ?? ''} onChange={(e) => setRole(p, portal.id, e.target.value)} aria-label={`${portal.name} role for ${p.name}`}>
                                {portal.roles
                                  .filter((r) => r.id !== 'admin')
                                  .map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.label}
                                    </option>
                                  ))}
                              </select>
                            )
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AddPerson({ portals, onDone }: { portals: PeopleData['portals']; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState({ name: '', email: '', role: 'employee', title: '' });
  const [picked, setPicked] = useState<string[]>(portals.length === 1 ? [portals[0].id] : []);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const every = v.role === 'company_admin' || v.role === 'management';
  async function save() {
    setBusy(true);
    const res = await addPersonAction({ ...v, role: v.role as 'employee', title: v.title || undefined, portals: every ? portals.map((p) => p.id) : picked, portalRoles: roles });
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast(every ? `${v.name} added with every portal.` : `${v.name} added. They can sign in now.`);
    onDone();
    router.refresh();
  }
  return (
    <div className="o-panel">
      <h2>Add person</h2>
      <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
        They sign in with this email and land in the portals you choose, with the role you pick.
      </p>
      <div className="o-grid2">
        <label className="o-field">
          Full name *
          <input className="o-input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </label>
        <label className="o-field">
          Email *
          <input className="o-input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </label>
        <label className="o-field">
          Company role
          <select className="o-select" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>
            {Object.entries(ROLE_LABEL).map(([id, l]) => (
              <option key={id} value={id}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="o-field">
          Job title
          <input className="o-input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Storekeeper" />
        </label>
      </div>
      <div className="o-stack" style={{ gap: 8, marginTop: 12 }}>
        <strong style={{ fontSize: 13 }}>Portals</strong>
        {every ? (
          <span className="faint" style={{ fontSize: 12 }}>
            Company admins and management get every portal the company has.
          </span>
        ) : (
          portals.map((p) => (
            <div key={p.id} className="o-row" style={{ gap: 12 }}>
              <label className="o-row" style={{ gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked((x) => (e.target.checked ? [...x, p.id] : x.filter((y) => y !== p.id)))} />
                {p.name}
              </label>
              {p.roles && picked.includes(p.id) && (
                <select className="o-select" style={{ width: 'auto' }} value={roles[p.id] ?? p.roles[0].id} onChange={(e) => setRoles((r) => ({ ...r, [p.id]: e.target.value }))} aria-label={`${p.name} role`}>
                  {p.roles
                    .filter((r) => r.id !== 'admin')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                </select>
              )}
            </div>
          ))
        )}
      </div>
      <div className="o-row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={busy || !v.name || !v.email || (!every && picked.length === 0)} onClick={save}>
          Add person
        </Button>
      </div>
    </div>
  );
}
