'use client';
import { useState } from 'react';
import { Button, TopBar } from '@orbit/ui';
import { createDirectAction } from '../actions';
import { UNITS } from '../config';
import { inspHref, PageHead } from './ui';
import { useRun } from './useRun';

type Line = { item: string; qty: string; unit: string };
const blank = (): Line => ({ item: '', qty: '', unit: UNITS[0] });

/**
 * Raise an inspection in Quality itself. Used by companies that have Quality on its own, and for
 * ad-hoc checks when other portals are on. `linked` names the portals that also send inspections.
 */
export function NewInspectionClient({ linked }: { linked: string[] }) {
  const { busy, run, router } = useRun();
  const [f, setF] = useState({ title: '', reference: '', party: '', notes: '', checklist: '' });
  const [lines, setLines] = useState<Line[]>([blank()]);
  const set = (i: number, p: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const items = lines.filter((l) => l.item.trim()).map((l) => ({ item: l.item.trim(), qty: Number(l.qty) || 0, unit: l.unit }));
  const ready = f.title.trim().length >= 3 && items.length > 0;
  return (
    <>
      <TopBar crumbs={['Quality', 'New inspection']} />
      <div className="o-page">
        <PageHead
          title="New inspection"
          lead={
            linked.length
              ? `Inspections from ${linked.join(' and ')} arrive by themselves. Use this for anything else you need inspected.`
              : 'Describe what is to be inspected. The QC engineer inspects it and the QC manager gives final approval.'
          }
        />
        <div className="o-panel o-stack" style={{ gap: 14 }}>
          <label className="o-field">
            What is to be inspected *
            <input className="o-input" value={f.title} maxLength={200} placeholder="e.g. Incoming plates for Job 214, lot 3" onChange={(e) => setF({ ...f, title: e.target.value })} />
          </label>
          <div className="o-form-row">
            <label className="o-field">
              Reference (PO, job or delivery note)
              <input className="o-input" value={f.reference} maxLength={60} onChange={(e) => setF({ ...f, reference: e.target.value })} />
            </label>
            <label className="o-field">
              Supplier or customer
              <input className="o-input" value={f.party} maxLength={160} onChange={(e) => setF({ ...f, party: e.target.value })} />
            </label>
          </div>
        </div>
        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>Items to inspect</h2>
          </div>
          <div className="o-stack" style={{ padding: '0 16px 16px', gap: 8 }}>
            {lines.map((l, i) => (
              <div key={i} className="o-row" style={{ gap: 8, alignItems: 'flex-end' }}>
                <label className="o-field" style={{ flex: 4 }}>
                  {i === 0 ? 'Item *' : <span className="faint">Item</span>}
                  <input className="o-input" value={l.item} maxLength={200} onChange={(e) => set(i, { item: e.target.value })} />
                </label>
                <label className="o-field" style={{ flex: 1, minWidth: 90 }}>
                  {i === 0 ? 'Quantity' : <span className="faint">Quantity</span>}
                  <input className="o-input" type="number" min={0} step="any" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} />
                </label>
                <label className="o-field" style={{ width: 96 }}>
                  {i === 0 ? 'Unit' : <span className="faint">Unit</span>}
                  <select className="o-select" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })}>
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </label>
                <Button size="small" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove item">
                  Remove
                </Button>
              </div>
            ))}
            <div>
              <Button size="small" onClick={() => setLines([...lines, blank()])}>
                Add item
              </Button>
            </div>
          </div>
        </div>
        <div className="o-panel o-stack" style={{ gap: 14 }}>
          <label className="o-field">
            Checks to make (one per line)
            <textarea className="o-textarea" style={{ minHeight: 96 }} value={f.checklist} placeholder={'Dimensions as per drawing\nMill test certificate matches heat number\nSurface free of damage'} onChange={(e) => setF({ ...f, checklist: e.target.value })} />
            <span className="help">Left empty, the inspector checks against the specification.</span>
          </label>
          <label className="o-field">
            Notes for the inspector
            <textarea className="o-textarea" value={f.notes} maxLength={2000} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </label>
        </div>
        <div className="o-row" style={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => router.push('/quality/inspections')}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy || !ready}
            onClick={async () => {
              const res = await run(
                () =>
                  createDirectAction({
                    title: f.title,
                    reference: f.reference || undefined,
                    party: f.party || undefined,
                    notes: f.notes || undefined,
                    items,
                    checklist: f.checklist.split('\n').map((c) => c.trim()).filter(Boolean),
                  }),
                'Inspection raised.',
              );
              if (res) router.push(inspHref(res.id));
            }}
          >
            Raise inspection
          </Button>
        </div>
      </div>
    </>
  );
}
