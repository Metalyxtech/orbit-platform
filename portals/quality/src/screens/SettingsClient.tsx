'use client';
import { useMemo, useState } from 'react';
import { Chip, SaveBar } from '@orbit/ui';
import { QC_ROLES, roleLabel, type QcRole } from '../config';
import { saveQualityAdminAction } from '../actions';
import type { QcPerson } from '../server';
import { useRun } from './useRun';

// Who is a QC engineer, QC manager or GM in Quality, and who can open the portal. Draft until saved.

type Draft = Record<string, { role: QcRole; access: QcPerson['access'] }>;

export function SettingsClient({ team }: { team: QcPerson[] }) {
  const { busy, run } = useRun();
  const saved = useMemo<Draft>(() => Object.fromEntries(team.map((p) => [p.membershipId, { role: p.qcRole, access: p.access }])), [team]);
  const [t, setT] = useState<Draft>(saved);
  const changes = team.filter((p) => t[p.membershipId].role !== p.qcRole || t[p.membershipId].access !== p.access);
  return (
    <>
      <div className="o-panel flush">
        <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
          <h2>Quality team</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            QC engineers inspect; the QC manager gives final approval. Save changes to apply.
          </span>
        </div>
        <div className="o-scroll">
          <table className="o-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Quality role</th>
                <th>Can open Quality</th>
                <th>What they do</th>
              </tr>
            </thead>
            <tbody>
              {team.map((p) => {
                const d = t[p.membershipId];
                const always = p.companyRole === 'company_admin' || p.companyRole === 'management';
                return (
                  <tr key={p.membershipId} className={changes.includes(p) ? 'selected' : undefined}>
                    <td>
                      {p.name}
                      <div className="faint" style={{ fontSize: 11 }}>
                        {p.email}
                      </div>
                    </td>
                    <td style={{ width: 230 }}>
                      {p.companyRole === 'company_admin' ? (
                        <Chip tone="steel">{roleLabel('admin')}</Chip>
                      ) : (
                        <select
                          className="o-select"
                          value={d.role}
                          aria-label={`Quality role for ${p.name}`}
                          onChange={(e) => setT({ ...t, [p.membershipId]: { role: e.target.value as QcRole, access: p.access === 'on' ? d.access : (e.target.value as QcRole) !== p.qcRole ? 'on' : p.access } })}
                        >
                          {QC_ROLES.filter((r) => r.id !== 'admin').map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={{ width: 180 }}>
                      {always ? (
                        <Chip tone="ok">Always</Chip>
                      ) : (
                        <label className="o-row" style={{ gap: 8, fontSize: 13 }}>
                          <input type="checkbox" checked={d.access === 'on'} aria-label={`${p.name} can open Quality`} onChange={(e) => setT({ ...t, [p.membershipId]: { ...d, access: e.target.checked ? 'on' : p.access === 'on' ? 'off' : p.access } })} />
                          {d.access === 'on' ? 'Yes' : p.access === 'requested' ? <Chip tone="hivis">Asked for access</Chip> : 'No'}
                        </label>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {QC_ROLES.find((r) => r.id === (p.companyRole === 'company_admin' ? 'admin' : d.role))?.detail}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <SaveBar
        dirty={changes.length > 0}
        busy={busy}
        what="the Quality team"
        impact={
          <>
            {changes.length} change{changes.length === 1 ? '' : 's'}:
            <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
              {changes.map((p) => {
                const d = t[p.membershipId];
                return (
                  <li key={p.membershipId}>
                    {p.name}: {[d.role !== p.qcRole ? `${roleLabel(p.qcRole)} → ${roleLabel(d.role)}` : '', d.access !== p.access ? (d.access === 'on' ? 'gets Quality access' : 'loses Quality access') : ''].filter(Boolean).join(', ')}
                  </li>
                );
              })}
            </ul>
            They apply as soon as you save.
          </>
        }
        onDiscard={() => setT(saved)}
        onSave={() =>
          run(
            () =>
              saveQualityAdminAction({
                team: changes.map((p) => ({
                  membershipId: p.membershipId,
                  role: t[p.membershipId].role !== p.qcRole ? t[p.membershipId].role : undefined,
                  access: t[p.membershipId].access !== p.access ? (t[p.membershipId].access === 'on' ? 'on' : 'off') : undefined,
                })),
              }),
            'Quality team saved.',
          )
        }
      />
    </>
  );
}
