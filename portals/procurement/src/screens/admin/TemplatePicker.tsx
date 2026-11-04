'use client';
import { useState } from 'react';
import { Button, ConfirmDialog } from '@orbit/ui';
import { applyTemplateAction } from '../../actions';
import { useSave } from './useSave';

export type TemplateInfo = { id: string; name: string; sector: string; desc: string; header: string[]; line: string[]; options: string[] };

const initials = (n: string) =>
  n
    .split(/[\s/]+/)
    .filter((w) => w && !['and', 'or', 'of'].includes(w.toLowerCase()))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

/**
 * Industry forms: pick the one that matches how the company works (steel fabrication, rebar, building,
 * MEP, process plant or general). Applying it gives everyone that requisition form and workflow.
 */
export function TemplatePicker({ templates, current }: { templates: TemplateInfo[]; current: string }) {
  const { busy, save } = useSave();
  const [pick, setPick] = useState(current);
  const [confirm, setConfirm] = useState(false);
  const [sector, setSector] = useState('All');
  const [q, setQ] = useState('');
  const chosen = templates.find((t) => t.id === pick);
  const sectors = ['All', ...Array.from(new Set(templates.map((t) => t.sector)))];
  const shown = templates.filter(
    (t) => (sector === 'All' || t.sector === sector) && (!q || `${t.name} ${t.desc} ${t.header.join(' ')} ${t.line.join(' ')}`.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <div className="o-panel">
      <div className="o-panel-head">
        <h2>Industry form</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          In use: <strong>{templates.find((t) => t.id === current)?.name ?? 'Custom'}</strong>
        </span>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
        Choose the form that matches your company. Everyone who raises a requisition gets it. You can still edit the fields below afterwards.
      </p>
      <div className="o-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <nav className="o-tabs" aria-label="Sector">
          {sectors.map((s) => (
            <a key={s} href="#" aria-current={sector === s ? 'page' : undefined} onClick={(e) => (e.preventDefault(), setSector(s))}>
              {s}
            </a>
          ))}
        </nav>
        <input className="o-input" style={{ maxWidth: 240 }} placeholder="Search industries" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search industries" />
      </div>
      <div className="p-tpl-grid">
        {shown.map((t) => (
          <button key={t.id} type="button" className={`p-tpl${pick === t.id ? ' on' : ''}`} onClick={() => setPick(t.id)} aria-pressed={pick === t.id}>
            <div className="p-tpl-top">
              <span className="p-tpl-ico" aria-hidden>
                {initials(t.name)}
              </span>
              <div>
                <strong>{t.name}</strong>
                <small>{t.sector}</small>
              </div>
              {t.id === current && <em>In use</em>}
            </div>
            <span>{t.desc}</span>
            <small className="p-tpl-count">
              {t.header.length} request fields · {t.line.length} line fields · {t.options.length} checks
            </small>
          </button>
        ))}
        {shown.length === 0 && <p className="faint">No industry matches. Pick General purchasing and add your own fields below.</p>}
      </div>
      {chosen && (
        <div className="p-tpl-detail">
          <div>
            <h3 className="o-subhead">Asked once per request</h3>
            <div className="p-chips">{chosen.header.length ? chosen.header.map((f) => <span key={f}>{f}</span>) : <em>Title, project, need-by date only</em>}</div>
          </div>
          <div>
            <h3 className="o-subhead">Columns on each item line</h3>
            <div className="p-chips">{chosen.line.length ? chosen.line.map((f) => <span key={f}>{f}</span>) : <em>Description, qty, unit, rate only</em>}</div>
          </div>
          <div>
            <h3 className="o-subhead">Industry checks</h3>
            <div className="p-chips">{chosen.options.length ? chosen.options.map((f) => <span key={f}>{f}</span>) : <em>None</em>}</div>
          </div>
          {pick !== current && (
            <div className="o-row" style={{ justifyContent: 'flex-end' }}>
              <Button variant="primary" disabled={busy} onClick={() => setConfirm(true)}>
                Use {chosen.name} form
              </Button>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title={`Use the ${chosen?.name ?? ''} form?`}
        confirmLabel="Use this form"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await save(() => applyTemplateAction({ template: pick }), `${chosen?.name} form is now in use for everyone.`);
        }}
      >
        This replaces your requisition form fields, workflow stage switches and industry checks with the {chosen?.name} set. Existing requests, stock, suppliers, approval rules and numbering stay as they are.
      </ConfirmDialog>
    </div>
  );
}
