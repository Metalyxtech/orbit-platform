'use client';
import { useMemo, useState } from 'react';
import { Chip, SaveBar } from '@orbit/ui';
import { PROD_ROLES, roleLabel, type ProdConfig, type ProdRole } from '../config';
import { TRADES } from '../trades';
import { saveProductionAdminAction } from '../actions';
import type { ProdPerson } from '../server';
import { useRun } from './useRun';

// Production settings for the company admin. Everything stays a draft until Save changes.

type Draft = Record<string, { role: ProdRole; access: ProdPerson['access'] }>;
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function SettingsClient({ cfg, team }: { cfg: ProdConfig; team: ProdPerson[] }) {
  const { busy, run } = useRun();
  const saved = useMemo(() => ({ trades: cfg.trades, overrunPct: cfg.overrunPct, requireRelease: cfg.requireRelease, requireFinalQc: cfg.requireFinalQc }), [cfg]);
  const savedTeam = useMemo<Draft>(() => Object.fromEntries(team.map((p) => [p.membershipId, { role: p.prodRole, access: p.access }])), [team]);
  const [f, setF] = useState(saved);
  const [t, setT] = useState<Draft>(savedTeam);
  const settingsDirty = !sameList(f.trades, saved.trades) || f.overrunPct !== saved.overrunPct || f.requireRelease !== saved.requireRelease || f.requireFinalQc !== saved.requireFinalQc;
  const teamChanges = team.filter((p) => t[p.membershipId].role !== p.prodRole || t[p.membershipId].access !== p.access);
  const summary = [
    ...(settingsDirty ? ['Production settings'] : []),
    ...teamChanges.map((p) => {
      const d = t[p.membershipId];
      return `${p.name}: ${[d.role !== p.prodRole ? `${roleLabel(p.prodRole)} → ${roleLabel(d.role)}` : '', d.access !== p.access ? (d.access === 'on' ? 'gets Production access' : 'loses Production access') : ''].filter(Boolean).join(', ')}`;
    }),
  ];
  const toggleTrade = (id: string, on: boolean) => setF({ ...f, trades: on ? [...f.trades, id] : f.trades.filter((x) => x !== id) });
  return (
    <>
      <div className="o-panel">
        <h2>Trades your company works in</h2>
        <p className="muted" style={{ fontSize: 12, margin: '-6px 0 10px' }}>
          Only these show when planning a work order. None ticked = all trades.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
          {TRADES.map((tr) => (
            <label key={tr.id} className="o-row" style={{ gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={f.trades.includes(tr.id)} onChange={(e) => toggleTrade(tr.id, e.target.checked)} />
              {tr.name}
            </label>
          ))}
        </div>
      </div>
      <div className="o-panel">
        <h2>Rules</h2>
        <div className="o-stack" style={{ gap: 10 }}>
          <label className="o-row" style={{ gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={f.requireRelease} onChange={(e) => setF({ ...f, requireRelease: e.target.checked })} />
            The production manager releases each work order before the floor starts
          </label>
          <label className="o-row" style={{ gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={f.requireFinalQc} onChange={(e) => setF({ ...f, requireFinalQc: e.target.checked })} />
            Final QC inspection before dispatch
          </label>
          <label className="o-field" style={{ maxWidth: 320 }}>
            Allowed overrun (output and material above plan) %
            <input className="o-input" type="number" min={0} max={50} value={f.overrunPct} onChange={(e) => setF({ ...f, overrunPct: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} />
          </label>
        </div>
      </div>
      <div className="o-panel flush">
        <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
          <h2>Production team</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            Choose roles and who can open Production, then Save changes.
          </span>
        </div>
        <div className="o-scroll">
          <table className="o-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Production role</th>
                <th>Can open Production</th>
                <th>What they do</th>
              </tr>
            </thead>
            <tbody>
              {team.map((p) => {
                const d = t[p.membershipId];
                const always = p.companyRole === 'company_admin' || p.companyRole === 'management';
                return (
                  <tr key={p.membershipId} className={teamChanges.includes(p) ? 'selected' : undefined}>
                    <td>
                      {p.name}
                      <div className="faint" style={{ fontSize: 11 }}>
                        {p.email}
                      </div>
                    </td>
                    <td style={{ width: 220 }}>
                      {p.companyRole === 'company_admin' ? (
                        <Chip tone="steel">{roleLabel('admin')}</Chip>
                      ) : (
                        <select
                          className="o-select"
                          value={d.role}
                          aria-label={`Production role for ${p.name}`}
                          onChange={(e) => setT({ ...t, [p.membershipId]: { role: e.target.value as ProdRole, access: p.access === 'on' ? d.access : (e.target.value as ProdRole) !== p.prodRole ? 'on' : p.access } })}
                        >
                          {PROD_ROLES.filter((r) => r.id !== 'admin').map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={{ width: 190 }}>
                      {always ? (
                        <Chip tone="ok">Always</Chip>
                      ) : (
                        <label className="o-row" style={{ gap: 8, fontSize: 13 }}>
                          <input type="checkbox" checked={d.access === 'on'} aria-label={`${p.name} can open Production`} onChange={(e) => setT({ ...t, [p.membershipId]: { ...d, access: e.target.checked ? 'on' : p.access === 'on' ? 'off' : p.access } })} />
                          {d.access === 'on' ? 'Yes' : p.access === 'requested' ? <Chip tone="hivis">Asked for access</Chip> : 'No'}
                        </label>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {PROD_ROLES.find((r) => r.id === (p.companyRole === 'company_admin' ? 'admin' : d.role))?.detail}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <SaveBar
        dirty={settingsDirty || teamChanges.length > 0}
        busy={busy}
        what="Production settings"
        impact={
          <>
            {summary.length} change{summary.length === 1 ? '' : 's'}:
            <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
              {summary.slice(0, 12).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            They apply for everyone as soon as you save.
          </>
        }
        onDiscard={() => {
          setF(saved);
          setT(savedTeam);
        }}
        onSave={() =>
          run(
            () =>
              saveProductionAdminAction({
                settings: settingsDirty ? f : undefined,
                team: teamChanges.map((p) => ({
                  membershipId: p.membershipId,
                  role: t[p.membershipId].role !== p.prodRole ? t[p.membershipId].role : undefined,
                  access: t[p.membershipId].access !== p.access ? (t[p.membershipId].access === 'on' ? 'on' : 'off') : undefined,
                })),
              }),
            'Production settings saved.',
          )
        }
      />
    </>
  );
}
