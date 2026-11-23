'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, TopBar, useToast } from '@orbit/ui';
import { createRequestAction } from '../actions';
import type { ProcConfig } from '../config';
import { FieldInput } from './FieldInput';
import { fmtMoney, fmtQty } from './ui';

type Item = { id: string; code: string; name: string; unit: string; available: number; avgCost: number };
type V = string | number | boolean | null;
type Line = { key: string; itemId: string | null; description: string; qty: number | null; unit: string; estRate: number | null; values: Record<string, V> };

const key = () => Math.random().toString(36).slice(2, 9);
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/** New requisition: the company's own form (header and line fields set by the admin). */
export function NewRequestClient({ form, currency, projects, items }: { form: ProcConfig['form']; currency: string; projects: string[]; items: Item[] }) {
  const router = useRouter();
  const toast = useToast();
  const blank = (): Line => ({ key: key(), itemId: null, description: '', qty: null, unit: form.unit, estRate: null, values: {} });
  const [title, setTitle] = useState('');
  const [project, setProject] = useState(projects[0] ?? '');
  const [needBy, setNeedBy] = useState(inDays(14));
  const [priority, setPriority] = useState<'Normal' | 'Urgent'>('Normal');
  const [header, setHeader] = useState<Record<string, V>>({});
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [busy, setBusy] = useState(false);

  const patch = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const pickItem = (i: number, id: string) => {
    const it = items.find((x) => x.id === id);
    patch(i, it ? { itemId: it.id, description: lines[i].description || it.name, unit: it.unit, estRate: lines[i].estRate ?? it.avgCost } : { itemId: null });
  };
  const estimate = lines.reduce((t, l) => t + (l.qty ?? 0) * (l.estRate ?? 0), 0);

  async function submit() {
    setBusy(true);
    const res = await createRequestAction({
      title,
      project,
      needBy,
      priority,
      header,
      lines: lines.map((l) => ({ itemId: l.itemId, description: l.description, qty: l.qty ?? 0, unit: l.unit, estRate: l.estRate ?? 0, values: l.values })),
    });
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast(`${res.data.number} raised.`);
    router.push(`/procurement/request?id=${res.data.id}`);
  }

  return (
    <>
      <TopBar crumbs={['Purchase', 'New requisition']} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>New requisition</h1>
            <p>{form.name}. Fields marked * are required.</p>
          </div>
        </div>
        <div className="o-panel">
          <div className="p-fields">
            <label className="o-field p-wide">
              Title *
              <input className="o-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Column cages for levels 10 to 12" />
            </label>
            <label className="o-field">
              Project *
              <select className="o-select" value={project} onChange={(e) => setProject(e.target.value)}>
                {projects.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="o-field">
              Need by *
              <input className="o-input" type="date" value={needBy} onChange={(e) => setNeedBy(e.target.value)} />
            </label>
            <label className="o-field">
              Priority
              <select className="o-select" value={priority} onChange={(e) => setPriority(e.target.value as 'Normal' | 'Urgent')}>
                <option>Normal</option>
                <option>Urgent</option>
              </select>
            </label>
            {form.header.map((f) => (
              <label key={f.id} className="o-field">
                {f.label}
                {f.required ? ' *' : ''}
                <FieldInput f={f} value={header[f.id]} onChange={(v) => setHeader((h) => ({ ...h, [f.id]: v }))} />
              </label>
            ))}
          </div>
        </div>
        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>Items</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              Estimate {fmtMoney(currency, estimate)}
            </span>
          </div>
          <div className="o-scroll">
            <table className="o-table p-lines">
              <thead>
                <tr>
                  <th>Stock item</th>
                  <th>Description *</th>
                  {form.line.map((f) => (
                    <th key={f.id}>
                      {f.label}
                      {f.required ? ' *' : ''}
                    </th>
                  ))}
                  <th className="num">Qty *</th>
                  <th>Unit</th>
                  <th className="num">Est. rate</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const it = items.find((x) => x.id === l.itemId);
                  return (
                    <tr key={l.key}>
                      <td style={{ minWidth: 170 }}>
                        <select className="o-select" value={l.itemId ?? ''} onChange={(e) => pickItem(i, e.target.value)} aria-label="Stock item">
                          <option value="">Not a stock item</option>
                          {items.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.code} {x.name}
                            </option>
                          ))}
                        </select>
                        {it && (
                          <div className={it.available > 0 ? 'faint' : 'hivis'} style={{ fontSize: 11, marginTop: 2 }}>
                            {fmtQty(it.available)} {it.unit} in stock
                          </div>
                        )}
                      </td>
                      <td style={{ minWidth: 200 }}>
                        <input className="o-input" value={l.description} onChange={(e) => patch(i, { description: e.target.value })} aria-label="Description" />
                      </td>
                      {form.line.map((f) => (
                        <td key={f.id} style={{ minWidth: 120 }}>
                          <FieldInput f={f} value={l.values[f.id]} onChange={(v) => patch(i, { values: { ...l.values, [f.id]: v } })} />
                        </td>
                      ))}
                      <td style={{ width: 100 }}>
                        <input className="o-input num" type="number" min={0} step="any" value={l.qty ?? ''} onChange={(e) => patch(i, { qty: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Quantity" />
                      </td>
                      <td style={{ width: 80 }}>
                        <input className="o-input" value={l.unit} onChange={(e) => patch(i, { unit: e.target.value })} aria-label="Unit" />
                      </td>
                      <td style={{ width: 110 }}>
                        <input className="o-input num" type="number" min={0} step="any" value={l.estRate ?? ''} onChange={(e) => patch(i, { estRate: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Estimated rate" />
                      </td>
                      <td>
                        {lines.length > 1 && (
                          <button type="button" className="o-btn small" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove line">
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 12 }}>
            <button type="button" className="o-dayline-add" onClick={() => setLines((ls) => [...ls, blank()])}>
              + Add a line
            </button>
          </div>
        </div>
        <div className="o-row" style={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => router.back()}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={submit}>
            {busy ? 'Raising...' : 'Raise requisition'}
          </Button>
        </div>
      </div>
    </>
  );
}
