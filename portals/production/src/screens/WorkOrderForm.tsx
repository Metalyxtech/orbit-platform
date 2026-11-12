'use client';
import { useMemo, useState } from 'react';
import { Button, TopBar } from '@orbit/ui';
import { DRAWINGS, fmtBytes, PRIORITIES, type Priority } from '../config';
import { TRADES, tradeOf, type Trade } from '../trades';
import { createWorkOrderAction, submitForReleaseAction, updateWorkOrderAction } from '../actions';
import { drawingProblem, uploadDrawings } from './Drawings';
import { PageHead } from './ui';
import { useRun } from './useRun';

// New work order (or editing a draft): choose the trade, fill its form, the bill of materials and
// the operations (prefilled from the trade, editable), then save a draft or send for release.

export interface WoFormValue {
  trade: string;
  title: string;
  customer: string;
  salesOrderId?: string;
  qty: string;
  unit: string;
  due: string;
  priority: Priority;
  fields: Record<string, string>;
  notes: string;
  materials: { item: string; qty: string; unit: string }[];
  operations: { name: string }[];
}

const fromTrade = (t: Trade): Pick<WoFormValue, 'unit' | 'operations' | 'fields'> => ({ unit: t.unit, operations: t.operations.map((o) => ({ name: o.name })), fields: {} });

export function WorkOrderForm({
  trades,
  salesOrders,
  projects = [],
  initial,
  editId,
  number,
  returnedNote,
}: {
  trades: string[];
  salesOrders: { id: string; number: string; title: string; customer: string }[];
  /** Company projects (no Sales portal): the work order belongs to one, for its project team. */
  projects?: { id: string; code: string; name: string }[];
  initial?: WoFormValue;
  editId?: string;
  number?: string;
  returnedNote?: string | null;
}) {
  const { busy, run, router, toast } = useRun();
  const list = useMemo(() => (trades.length ? TRADES.filter((t) => trades.includes(t.id)) : TRADES), [trades]);
  const [v, setV] = useState<WoFormValue>(
    initial ?? { trade: '', title: '', customer: '', qty: '1', unit: 'nos', due: '', priority: 'normal', fields: {}, notes: '', materials: [], operations: [] },
  );
  const trade = v.trade ? tradeOf(v.trade) : null;
  // Drawings chosen here are uploaded right after the work order is saved.
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const attach = async (id: string) => {
    if (!files.length) return true;
    const failed = await uploadDrawings(id, files, setProgress);
    if (failed.length) toast(`Saved, but not attached: ${failed.join(', ')}. Attach them on the work order.`, 'bad');
    return true;
  };
  const set = (patch: Partial<WoFormValue>) => setV((x) => ({ ...x, ...patch }));
  const pickTrade = (t: Trade) => set({ trade: t.id, ...fromTrade(t), materials: v.materials });

  const payload = () => ({
    trade: v.trade,
    title: v.title,
    customer: v.customer || undefined,
    salesOrderId: v.salesOrderId,
    qty: Number(v.qty) || 0,
    unit: v.unit,
    due: v.due || undefined,
    priority: v.priority,
    fields: v.fields,
    notes: v.notes || undefined,
    materials: v.materials.filter((m) => m.item.trim()).map((m) => ({ item: m.item, qty: Number(m.qty) || 0, unit: m.unit || 'nos' })),
    operations: v.operations.filter((o) => o.name.trim()),
  });
  const save = async (submit: boolean) => {
    if (editId) {
      const ok = await run(() => updateWorkOrderAction({ id: editId, ...payload() }), 'Plan saved.');
      if (ok) await attach(editId);
      if (ok && submit) await run(() => submitForReleaseAction({ id: editId }), 'Sent for release.');
      if (ok) router.push(`/production/order?id=${editId}`);
      return;
    }
    const res = await run(() => createWorkOrderAction({ ...payload(), submit }), submit ? 'Work order sent for release.' : 'Draft saved.');
    if (res) {
      await attach(res.id);
      router.push(`/production/order?id=${res.id}`);
    }
  };

  return (
    <>
      <TopBar crumbs={['Production', 'Work orders', number ?? 'New']} />
      <div className="o-page">
        <PageHead title={editId ? `Edit ${number}` : 'New work order'} lead="Pick the trade: its form, operations and QC checklist load for you. Change anything that differs on this job." />
        {returnedNote && (
          <div className="o-panel" style={{ borderLeft: '4px solid var(--hivis, #d97706)' }}>
            <strong>Sent back by the production manager</strong>
            <p style={{ margin: '6px 0 0' }}>“{returnedNote}”</p>
          </div>
        )}

        <div className="o-panel">
          <h2>1. Trade</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {list.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`b-bundle${v.trade === t.id ? ' on' : ''}`}
                onClick={() => (v.trade && v.trade !== t.id && v.operations.length && !confirm('Change the trade? Operations and the form reset to the new trade.') ? null : pickTrade(t))}
                aria-pressed={v.trade === t.id}
              >
                <span className="b-radio" aria-hidden />
                <span>
                  <strong>{t.name}</strong>
                  <small>{t.detail}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        {trade && (
          <>
            <div className="o-panel">
              <h2>2. Job</h2>
              {!editId && salesOrders.length > 0 && (
                <label className="o-field" style={{ marginBottom: 10 }}>
                  From a won sales order (optional)
                  <select
                    className="o-select"
                    value={v.salesOrderId ?? ''}
                    onChange={(e) => {
                      const so = salesOrders.find((s) => s.id === e.target.value);
                      set({ salesOrderId: so?.id, ...(so ? { title: v.title || so.title, customer: so.customer } : {}) });
                    }}
                  >
                    <option value="">Not from a sales order</option>
                    {salesOrders.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.number} · {s.customer} · {s.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {projects.length > 0 && (
                <label className="o-field" style={{ marginBottom: 10 }}>
                  Project
                  <select className="o-select" value={v.fields._project ?? ''} onChange={(e) => set({ fields: { ...v.fields, _project: e.target.value } })}>
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </select>
                  <span className="help">Only the project's team (with the GM and admins) will see this work order when the project has a team.</span>
                </label>
              )}
              <div className="o-form-row">
                <label className="o-field" style={{ flex: '2 1 300px' }}>
                  What to make
                  <input className="o-input" value={v.title} maxLength={200} placeholder="e.g. Pipe rack PR-3, 12 frames" onChange={(e) => set({ title: e.target.value })} />
                </label>
                <label className="o-field">
                  Customer / project
                  <input className="o-input" value={v.customer} maxLength={160} onChange={(e) => set({ customer: e.target.value })} />
                </label>
              </div>
              <div className="o-form-row" style={{ marginTop: 10 }}>
                <label className="o-field">
                  Quantity
                  <input className="o-input" type="number" min={0} step="any" value={v.qty} onChange={(e) => set({ qty: e.target.value })} />
                </label>
                <label className="o-field">
                  Unit
                  <select className="o-select" value={v.unit} onChange={(e) => set({ unit: e.target.value })}>
                    {[...new Set([...trade.units, v.unit])].map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </label>
                <label className="o-field">
                  Due date
                  <input className="o-input" type="date" value={v.due} onChange={(e) => set({ due: e.target.value })} />
                </label>
                <label className="o-field">
                  Priority
                  <select className="o-select" value={v.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
                    {PRIORITIES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="o-panel">
              <h2>3. {trade.name} form</h2>
              <div className="o-form-row">
                {trade.fields.map((f) => (
                  <label key={f.id} className="o-field">
                    {f.label}
                    {f.required ? ' *' : ''}
                    {f.unit ? ` (${f.unit})` : ''}
                    {f.type === 'select' ? (
                      <select className="o-select" value={v.fields[f.id] ?? ''} onChange={(e) => set({ fields: { ...v.fields, [f.id]: e.target.value } })}>
                        <option value="">Choose…</option>
                        {f.options!.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input className="o-input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={v.fields[f.id] ?? ''} maxLength={500} onChange={(e) => set({ fields: { ...v.fields, [f.id]: e.target.value } })} />
                    )}
                    {f.help && <span className="help">{f.help}</span>}
                  </label>
                ))}
              </div>
            </div>

            <div className="o-half">
              <div className="o-panel">
                <div className="o-panel-head">
                  <h2>4. Materials</h2>
                  <Button size="small" onClick={() => set({ materials: [...v.materials, { item: '', qty: '', unit: 'nos' }] })}>
                    Add material
                  </Button>
                </div>
                <datalist id="trade-materials">
                  {trade.materials.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                {v.materials.length === 0 && <p className="faint" style={{ fontSize: 12, margin: 0 }}>No materials yet. The store issues against this list.</p>}
                <div className="o-stack" style={{ gap: 6 }}>
                  {v.materials.map((m, i) => (
                    <div key={i} className="o-row">
                      <input className="o-input" list="trade-materials" value={m.item} placeholder="Item" aria-label={`Material ${i + 1}`} onChange={(e) => set({ materials: v.materials.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)) })} />
                      <input className="o-input" type="number" min={0} step="any" value={m.qty} placeholder="Qty" style={{ width: 90 }} aria-label={`Material ${i + 1} quantity`} onChange={(e) => set({ materials: v.materials.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })} />
                      <input className="o-input" value={m.unit} style={{ width: 70 }} aria-label={`Material ${i + 1} unit`} onChange={(e) => set({ materials: v.materials.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })} />
                      <Button size="small" onClick={() => set({ materials: v.materials.filter((_, j) => j !== i) })} aria-label={`Remove material ${i + 1}`}>
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="o-panel">
                <div className="o-panel-head">
                  <h2>5. Operations</h2>
                  <Button size="small" onClick={() => set({ operations: [...v.operations, { name: '' }] })}>
                    Add operation
                  </Button>
                </div>
                <div className="o-stack" style={{ gap: 6 }}>
                  {v.operations.map((o, i) => (
                    <div key={i} className="o-row">
                      <span className="faint" style={{ width: 18 }}>
                        {i + 1}
                      </span>
                      <input className="o-input" value={o.name} aria-label={`Operation ${i + 1}`} onChange={(e) => set({ operations: v.operations.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                      <Button size="small" disabled={i === 0} onClick={() => set({ operations: v.operations.map((x, j) => (j === i - 1 ? v.operations[i] : j === i ? v.operations[i - 1] : x)) })} aria-label={`Move operation ${i + 1} up`}>
                        ↑
                      </Button>
                      <Button size="small" onClick={() => set({ operations: v.operations.filter((_, j) => j !== i) })} aria-label={`Remove operation ${i + 1}`}>
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="faint" style={{ fontSize: 11, margin: '8px 0 0' }}>
                  When every operation is done, the work goes to QC in the Quality portal (if your company has it).
                </p>
              </div>
            </div>

            <div className="o-panel">
              <div className="o-panel-head">
                <h2>6. Workshop drawings</h2>
                <label className="o-btn small" style={{ cursor: 'pointer' }}>
                  Choose files
                  <input
                    type="file"
                    multiple
                    accept={DRAWINGS.accept}
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const picked = Array.from(e.target.files ?? []);
                      e.target.value = '';
                      const bad = picked.filter((f) => drawingProblem(f));
                      if (bad.length) toast(`Not added: ${bad.map((f) => `${f.name} (${drawingProblem(f)})`).join(', ')}`, 'bad');
                      setFiles([...files, ...picked.filter((f) => !drawingProblem(f))].slice(0, DRAWINGS.maxFiles));
                    }}
                  />
                </label>
              </div>
              {files.length === 0 ? (
                <p className="faint" style={{ fontSize: 12, margin: 0 }}>
                  PDF, DWG, DXF or images. The supervisor, QC and store see them on the work order. You can add more later.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="o-row" style={{ fontSize: 13 }}>
                      <span style={{ flex: 1 }}>{f.name}</span>
                      <span className="faint" style={{ fontSize: 11 }}>
                        {fmtBytes(f.size)}
                      </span>
                      <Button size="small" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                        ×
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {progress && <p className="hivis" style={{ fontSize: 12, margin: '8px 0 0' }}>Uploading {progress}</p>}
            </div>

            <div className="o-panel">
              <label className="o-field">
                Notes for the shop floor
                <textarea className="o-textarea" rows={3} value={v.notes} maxLength={4000} onChange={(e) => set({ notes: e.target.value })} />
              </label>
            </div>

            <div className="o-row">
              <Button disabled={busy || !!progress} onClick={() => save(false)}>
                Save draft
              </Button>
              <Button variant="primary" disabled={busy || !!progress} onClick={() => save(true)}>
                Save and send for release
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
