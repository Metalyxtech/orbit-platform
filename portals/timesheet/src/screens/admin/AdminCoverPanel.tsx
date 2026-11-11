'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { RoleCoverage, RoleCovers, SaveBar, sameRoles, useToast } from '@orbit/ui';
import { saveAdminCoversAction } from '../../actions';
import type { AdminCoverView } from '../../server';

// Company admins who also approve as Supervisor, Project manager or Management. Draft until saved.

export function AdminCoverPanel({ view }: { view: AdminCoverView }) {
  const toast = useToast();
  const router = useRouter();
  const saved = useMemo(() => Object.fromEntries(view.admins.map((a) => [a.membershipId, a.covers as string[]])), [view]);
  const [d, setD] = useState<Record<string, string[]>>(saved);
  const [busy, setBusy] = useState(false);
  const changed = view.admins.filter((a) => !sameRoles(d[a.membershipId] ?? [], a.covers));
  const counts = Object.fromEntries(view.roles.map((r) => [r.id, view.holders[r.id] + view.admins.filter((a) => (d[a.membershipId] ?? []).includes(r.id)).length]));
  const label = (id: string) => view.roles.find((r) => r.id === id)?.label ?? id;
  if (!view.ready || !view.admins.length) return null;
  return (
    <>
      <RoleCoverage
        roles={view.roles}
        counts={counts}
        needed={['supervisor', 'project_manager']}
        note="People who approve timesheets in each role, plus company admins who cover it. Change a person's role in the table below."
      />
      <div className="o-panel">
        <h2>Company admins: also approve as</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
          Workflow steps for a ticked role also go to this admin, and so do people with no supervisor or projects with no project manager.
        </p>
        <div className="o-stack" style={{ gap: 12 }}>
          {view.admins.map((a) => (
            <div key={a.membershipId} className="o-row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 220 }}>
                <strong>{a.name}</strong>
                <div className="faint" style={{ fontSize: 11 }}>
                  {a.email} · Company admin
                </div>
              </div>
              <RoleCovers
                name={a.name}
                roles={view.roles}
                value={d[a.membershipId] ?? []}
                vacant={view.roles.filter((r) => !view.holders[r.id]).map((r) => r.id)}
                label="Also approves as:"
                onChange={(next) => setD({ ...d, [a.membershipId]: next })}
              />
            </div>
          ))}
        </div>
      </div>
      <SaveBar
        dirty={changed.length > 0}
        busy={busy}
        what="admin approval cover"
        impact={
          <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
            {changed.map((a) => {
              const roles = d[a.membershipId] ?? [];
              return (
                <li key={a.membershipId}>
                  {a.name}: also approves as {roles.length ? roles.map(label).join(', ') : 'no other role'}
                </li>
              );
            })}
          </ul>
        }
        onDiscard={() => setD(saved)}
        onSave={async () => {
          setBusy(true);
          const res = await saveAdminCoversAction({ changes: changed.map((a) => ({ membershipId: a.membershipId, covers: (d[a.membershipId] ?? []) as ('supervisor' | 'project_manager' | 'management')[] })) });
          setBusy(false);
          if (!res.ok) return toast(res.error, 'bad');
          toast('Admin approval cover saved. New submissions follow it.');
          router.refresh();
        }}
      />
    </>
  );
}
