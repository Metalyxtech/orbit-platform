'use client';
import { useState } from 'react';
import { Button, TopBar } from '@orbit/ui';
import { addIndustryCheckAction, removeIndustryCheckAction, saveWorkflowAction } from '../../actions';
import { PROC_ROLES, STAGES, WORK, type ProcConfig, type StageKey } from '../../config';
import { TemplatePicker, type TemplateInfo } from './TemplatePicker';
import { useSave } from './useSave';


/** Admin > Purchase workflow: industry template, stage switches and owners, industry options. */
export function WorkflowClient({ config, templates, checks }: { config: ProcConfig; templates: TemplateInfo[]; checks: { id: string; label: string; desc: string; from: string }[] }) {
  const [addId, setAddId] = useState('');
  const available = checks.filter((c) => !config.options.some((o) => o.id === c.id));
  const { busy, save } = useSave();
  const [flow, setFlow] = useState(config.flow);
  const [stageCfg, setStageCfg] = useState(config.stageCfg);
  const [minQuotes, setMinQuotes] = useState(config.minQuotes);
  const [options, setOptions] = useState(Object.fromEntries(config.options.map((o) => [o.id, o.on])));
  const stages: StageKey[] = [...WORK, 'stock_issue'];
  const label = (k: StageKey) => stageCfg[k]?.label || STAGES[k].label;
  const on = (k: StageKey) => !STAGES[k].optional || flow[k as keyof typeof flow];

  return (
    <>
      <TopBar crumbs={['Purchase', 'Admin', 'Purchase workflow']} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Purchase workflow</h1>
            <p>How every request moves in your company. Changes apply to requests as they move forward.</p>
          </div>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => save(() => saveWorkflowAction({ flow, stageCfg: stageCfg as Record<string, { label?: string; role?: (typeof PROC_ROLES)[number]['id'] }>, minQuotes, options }), 'Workflow saved.')}
          >
            Save workflow
          </Button>
        </div>

        <TemplatePicker templates={templates} current={config.template} />

        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>Stages</h2>
          </div>
          <div className="o-scroll">
            <table className="o-table">
              <thead>
                <tr>
                  <th>On</th>
                  <th>Stage name</th>
                  <th>Handled by</th>
                  <th>What happens</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((k) => {
                  const st = STAGES[k];
                  return (
                    <tr key={k}>
                      <td>
                        {st.optional ? (
                          <input type="checkbox" checked={flow[k as keyof typeof flow]} onChange={(e) => setFlow((f) => ({ ...f, [k]: e.target.checked }))} aria-label={`Use ${st.label}`} />
                        ) : (
                          <span className="faint" style={{ fontSize: 11 }}>
                            Always
                          </span>
                        )}
                      </td>
                      <td style={{ minWidth: 180 }}>
                        <input className="o-input" value={label(k)} onChange={(e) => setStageCfg((c) => ({ ...c, [k]: { ...c[k], label: e.target.value } }))} aria-label="Stage name" />
                      </td>
                      <td style={{ minWidth: 170 }}>
                        {st.role === 'approval' ? (
                          <span className="faint">Approval rules</span>
                        ) : (
                          <select className="o-select" value={stageCfg[k]?.role ?? st.role} onChange={(e) => setStageCfg((c) => ({ ...c, [k]: { ...c[k], role: e.target.value as (typeof PROC_ROLES)[number]['id'] } }))} aria-label="Handled by">
                            {PROC_ROLES.filter((r) => r.id !== 'admin').map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="muted" style={{ fontSize: 12, whiteSpace: 'normal', minWidth: 240 }}>
                        {st.what}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 16 }}>
            <label className="o-field" style={{ maxWidth: 260 }}>
              Minimum quotes before award
              <input className="o-input" type="number" min={1} max={6} value={minQuotes} onChange={(e) => setMinQuotes(Number(e.target.value))} />
              <span className="help">1 allows single-source purchases</span>
            </label>
          </div>
        </div>

        <div className="o-panel">
          <div className="o-panel-head">
            <h2>Industry checks</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              Switch on, off, or add checks used in other industries
            </span>
          </div>
          {config.options.length === 0 && <p className="faint">No industry checks yet. Add one below.</p>}
          {config.options.map((o) => (
            <div key={o.id} className="p-opt">
              <input type="checkbox" checked={options[o.id] ?? o.on} onChange={(e) => setOptions((x) => ({ ...x, [o.id]: e.target.checked }))} aria-label={o.label} />
              <div style={{ flex: 1 }}>
                <strong>{o.label}</strong>
                <span>{o.desc}</span>
              </div>
              <button type="button" className="o-btn small" disabled={busy} onClick={() => save(() => removeIndustryCheckAction({ id: o.id }), `${o.label} removed.`)}>
                Remove
              </button>
            </div>
          ))}
          {available.length > 0 && (
            <div className="o-row" style={{ marginTop: 12, gap: 8 }}>
              <select className="o-select" style={{ maxWidth: 420 }} value={addId} onChange={(e) => setAddId(e.target.value)} aria-label="Add an industry check">
                <option value="">Add a check from any industry…</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.from})
                  </option>
                ))}
              </select>
              <Button disabled={!addId || busy} onClick={async () => (await save(() => addIndustryCheckAction({ id: addId }), 'Check added.')) && setAddId('')}>
                Add check
              </Button>
            </div>
          )}
        </div>

        <div className="o-panel">
          <h2>Resulting workflow</h2>
          <div className="p-flow">
            <span>Raised</span>
            {WORK.map((k) => (
              <span key={k} className={on(k) ? '' : 'off'}>
                {label(k)}
              </span>
            ))}
            <span>Closed</span>
          </div>
          {flow.stock_check && (
            <div className="p-flow" style={{ marginTop: 8 }}>
              <em>If stock covers everything:</em>
              <span>{label('stock_check')}</span>
              <span className="br">{label('stock_issue')}</span>
              <span>Closed</span>
            </div>
          )}
          <p className="faint" style={{ fontSize: 11, margin: '8px 0 0' }}>
            Struck-through stages are skipped.
          </p>
        </div>
      </div>
    </>
  );
}
