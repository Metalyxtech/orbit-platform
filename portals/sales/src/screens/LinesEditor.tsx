'use client';
import { useState } from 'react';
import { Button } from '@orbit/ui';
import { fmtMoney, UNITS } from '../config';
import { saveLinesAction } from '../actions';
import { useRun } from './useRun';

export interface LineView {
  item: string;
  qty: number;
  unit: string;
  rate: number;
  cost: number;
}

/**
 * Quotation lines. Sales edits items, quantities and rates before pricing; the estimator enters
 * costs while costing; after pricing only rates change.
 */
export function LinesEditor({
  enquiryId,
  lines: initial,
  currency,
  canEdit,
  ratesOnly,
  editCost,
  seeCost,
  editRate,
}: {
  enquiryId: string;
  lines: LineView[];
  currency: string;
  canEdit: boolean;
  ratesOnly: boolean;
  editCost: boolean;
  seeCost: boolean;
  editRate: boolean;
}) {
  const { busy, run } = useRun();
  const [lines, setLines] = useState<LineView[]>(initial);
  const [dirty, setDirty] = useState(false);
  const set = (i: number, patch: Partial<LineView>) => {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const structure = canEdit && !ratesOnly;
  const num = (v: string) => (v === '' ? 0 : Number(v));
  return (
    <div className="o-panel flush">
      <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
        <h2>Quotation lines</h2>
        {canEdit && (
          <div className="o-row">
            {structure && (
              <Button size="small" onClick={() => (setLines((ls) => [...ls, { item: '', qty: 1, unit: UNITS[0], rate: 0, cost: 0 }]), setDirty(true))}>
                Add line
              </Button>
            )}
            <Button size="small" variant="primary" disabled={busy || !dirty} onClick={async () => (await run(() => saveLinesAction({ id: enquiryId, lines }), 'Lines saved.')) && setDirty(false)}>
              Save lines
            </Button>
          </div>
        )}
      </div>
      <div className="o-scroll">
        <table className="o-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item / scope</th>
              <th className="num">Qty</th>
              <th>Unit</th>
              <th className="num">Rate</th>
              {seeCost && <th className="num">Cost</th>}
              <th className="num">Amount</th>
              {structure && <th />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={8} className="faint">
                  No lines yet.{structure ? ' Add the scope the customer asked for.' : ''}
                </td>
              </tr>
            )}
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="faint">{i + 1}</td>
                <td style={{ minWidth: 220 }}>{structure ? <input className="o-input" value={l.item} maxLength={300} onChange={(e) => set(i, { item: e.target.value })} aria-label={`Line ${i + 1} item`} /> : l.item}</td>
                <td className="num" style={{ width: 100 }}>
                  {structure ? <input className="o-input" type="number" min={0} step="any" value={l.qty} onChange={(e) => set(i, { qty: num(e.target.value) })} aria-label={`Line ${i + 1} quantity`} /> : l.qty.toLocaleString('en-IN')}
                </td>
                <td style={{ width: 90 }}>
                  {structure ? (
                    <select className="o-select" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} aria-label={`Line ${i + 1} unit`}>
                      {[...new Set([...UNITS, l.unit])].map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  ) : (
                    l.unit
                  )}
                </td>
                <td className="num" style={{ width: 130 }}>
                  {canEdit && editRate ? <input className="o-input" type="number" min={0} step="any" value={l.rate} onChange={(e) => set(i, { rate: num(e.target.value) })} aria-label={`Line ${i + 1} rate`} /> : l.rate ? fmtMoney(currency, l.rate) : '-'}
                </td>
                {seeCost && (
                  <td className="num" style={{ width: 130 }}>
                    {canEdit && editCost ? <input className="o-input" type="number" min={0} step="any" value={l.cost} onChange={(e) => set(i, { cost: num(e.target.value) })} aria-label={`Line ${i + 1} cost`} /> : l.cost ? fmtMoney(currency, l.cost) : '-'}
                  </td>
                )}
                <td className="num">{fmtMoney(currency, l.qty * l.rate)}</td>
                {structure && (
                  <td>
                    <Button size="small" onClick={() => (setLines((ls) => ls.filter((_, j) => j !== i)), setDirty(true))} aria-label={`Remove line ${i + 1}`}>
                      ×
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dirty && <p className="hivis" style={{ fontSize: 12, margin: '8px 16px' }}>Unsaved changes. Save lines before the next step.</p>}
    </div>
  );
}
