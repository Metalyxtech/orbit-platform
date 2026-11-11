'use client';
import { useState } from 'react';
import { SaveBar, TopBar } from '@orbit/ui';
import { saveLevelsAction } from '../../actions';
import { ACTING_ROLES, PROC_ROLES, roleLabel, type ApprovalLevel, type ProcRole } from '../../config';
import { fmtMoney } from '../ui';
import { useSave } from './useSave';

/** Admin > Approval rules: value-based levels for requisitions and POs, with a route checker. */
export function ApprovalsClient({ levels: initial, currency }: { levels: ApprovalLevel[]; currency: string }) {
  const { busy, save } = useSave();
  const [levels, setLevels] = useState(initial);
  const [sim, setSim] = useState(72000);
  const set = (i: number, p: Partial<ApprovalLevel>) => setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const chain = (kind: 'pr' | 'po') => levels.filter((l) => l[kind] && sim >= l.min).sort((a, b) => a.min - b.min);
  const add = () => setLevels((ls) => [...ls, { id: `l${Date.now().toString(36)}`, name: 'New level', role: 'manager', min: 0, pr: true, po: true }]);

  return (
    <>
      <TopBar crumbs={['Purchase', 'Admin', 'Approval rules']} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Approval rules</h1>
            <p>Each level signs off in order once the value reaches its threshold. Requisitions use the estimate of what is bought; POs use the awarded value.</p>
          </div>
        </div>
        <div className="o-panel flush">
          <div className="o-scroll">
            <table className="o-table">
              <thead>
                <tr>
                  <th>Level name</th>
                  <th>Approver</th>
                  <th className="num">Applies from ({currency})</th>
                  <th>Requisition</th>
                  <th>PO</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {levels.map((l, i) => (
                  <tr key={l.id}>
                    <td style={{ minWidth: 180 }}>
                      <input className="o-input" value={l.name} onChange={(e) => set(i, { name: e.target.value })} aria-label="Level name" />
                    </td>
                    <td style={{ minWidth: 170 }}>
                      <select className="o-select" value={l.role} onChange={(e) => set(i, { role: e.target.value as ProcRole })} aria-label="Approver">
                        {ACTING_ROLES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ width: 150 }}>
                      <input className="o-input num" type="number" min={0} value={l.min} onChange={(e) => set(i, { min: Number(e.target.value) })} aria-label="Applies from" />
                    </td>
                    <td>
                      <input type="checkbox" checked={l.pr} onChange={(e) => set(i, { pr: e.target.checked })} aria-label="Requisition approval" />
                    </td>
                    <td>
                      <input type="checkbox" checked={l.po} onChange={(e) => set(i, { po: e.target.checked })} aria-label="PO approval" />
                    </td>
                    <td>
                      <button type="button" className="o-btn small" onClick={() => setLevels((ls) => ls.filter((_, j) => j !== i))}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 12 }}>
            <button type="button" className="o-dayline-add" onClick={add}>
              + Add level
            </button>
          </div>
        </div>
        <div className="o-panel">
          <div className="o-panel-head">
            <h2>Check a route</h2>
          </div>
          <label className="o-field" style={{ maxWidth: 240 }}>
            Value ({currency})
            <input className="o-input num" type="number" min={0} value={sim} onChange={(e) => setSim(Number(e.target.value))} />
          </label>
          <div className="o-half" style={{ marginTop: 12 }}>
            {(['pr', 'po'] as const).map((k) => (
              <div key={k}>
                <h3 className="o-subhead">{k === 'pr' ? 'Requisition approval' : 'PO approval'} for {fmtMoney(currency, sim)}</h3>
                {chain(k).length ? (
                  <ol className="p-chain">
                    {chain(k).map((l) => (
                      <li key={l.id}>
                        <strong>{l.name}</strong>
                        <span className="faint">{roleLabel(l.role)}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="faint" style={{ fontSize: 12 }}>
                    No approval: this stage is skipped.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
        <SaveBar
          dirty={JSON.stringify(levels) !== JSON.stringify(initial)}
          busy={busy}
          what="the approval rules"
          impact="Requests already waiting keep their approvers; the new rules apply from the next approval step."
          onDiscard={() => setLevels(initial)}
          onSave={() => save(() => saveLevelsAction(levels), 'Approval rules saved.')}
        />
      </div>
    </>
  );
}
