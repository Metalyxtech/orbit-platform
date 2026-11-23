'use client';
import { useState } from 'react';
import { Button, Chip, SaveBar } from '@orbit/ui';
import { fmtMoney, suggestedRate, unitCost, UNITS } from '../config';
import { pricingDoneAction, saveCostingAction } from '../actions';
import { useRun } from './useRun';

// The estimator's costing sheet. Each line's unit cost is material + labour + other; a markup on
// cost gives the suggested selling rates sales starts from. Edits are a draft until Save costing;
// Pricing done needs the sheet saved. Sales managers and the GM see it read-only.

export interface CostLine {
  item: string;
  qty: number;
  unit: string;
  material: number;
  labour: number;
  other: number;
  rate: number;
}

const blank = (): CostLine => ({ item: '', qty: 1, unit: UNITS[0], material: 0, labour: 0, other: 0, rate: 0 });
const num = (v: string) => (v === '' ? 0 : Math.max(0, Number(v) || 0));

export function CostingSheet({
  enquiryId,
  lines: savedLines,
  markup: savedMarkup,
  notes: savedNotes,
  currency,
  editable,
  canFinish,
  priced,
}: {
  enquiryId: string;
  lines: CostLine[];
  markup: number;
  notes: string;
  currency: string;
  editable: boolean;
  canFinish: boolean;
  priced: boolean;
}) {
  const { busy, run } = useRun();
  const [lines, setLines] = useState<CostLine[]>(savedLines.length ? savedLines : editable ? [blank()] : []);
  const [markup, setMarkup] = useState(String(savedMarkup || ''));
  const [notes, setNotes] = useState(savedNotes);
  const m = (v: number) => fmtMoney(currency, v);
  const mk = num(markup);
  const set = (i: number, patch: Partial<CostLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const key = (ls: CostLine[]) => JSON.stringify(ls.map((l) => [l.item.trim(), l.qty, l.unit, l.material, l.labour, l.other]));
  const dirty = editable && (key(lines) !== key(savedLines.length ? savedLines : [blank()]) || mk !== (savedMarkup || 0) || notes.trim() !== (savedNotes || '').trim());

  const tot = lines.reduce(
    (t, l) => ({ material: t.material + l.qty * l.material, labour: t.labour + l.qty * l.labour, other: t.other + l.qty * l.other, cost: t.cost + l.qty * unitCost(l), sell: t.sell + l.qty * (priced && l.rate ? l.rate : suggestedRate(unitCost(l), mk)) }),
    { material: 0, labour: 0, other: 0, cost: 0, sell: 0 },
  );
  const margin = tot.sell > 0 ? ((tot.sell - tot.cost) / tot.sell) * 100 : 0;
  const missing = lines.filter((l) => l.qty > 0 && unitCost(l) <= 0).length;

  const save = () => run(() => saveCostingAction({ id: enquiryId, lines: lines.filter((l) => l.item.trim()), markup: mk, notes }), 'Costing saved.');

  const cell = (i: number, k: 'material' | 'labour' | 'other') =>
    editable ? (
      <input className="o-input" type="number" min={0} step="any" value={lines[i][k] || ''} placeholder="0" onChange={(e) => set(i, { [k]: num(e.target.value) })} aria-label={`Line ${i + 1} ${k} per unit`} style={{ textAlign: 'right' }} />
    ) : (
      m(lines[i][k])
    );

  return (
    <div className="o-panel flush">
      <div className="o-panel-head" style={{ padding: '14px 16px 0', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2>Costing sheet</h2>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
            {editable ? 'Cost per unit for each line. Markup gives the suggested selling rate sales starts from.' : priced ? 'Costed by the estimator. Selling rates are now with sales.' : 'The estimator is working on this.'}
          </p>
        </div>
        {editable && (
          <Button size="small" onClick={() => setLines([...lines, blank()])}>
            Add line
          </Button>
        )}
      </div>
      <div className="o-scroll" style={{ marginTop: 12 }}>
        <table className="o-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item / scope</th>
              <th className="num">Qty</th>
              <th>Unit</th>
              <th className="num">Material / unit</th>
              <th className="num">Labour / unit</th>
              <th className="num">Other / unit</th>
              <th className="num">Unit cost</th>
              <th className="num">Total cost</th>
              <th className="num">{priced ? 'Selling rate' : 'Suggested rate'}</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={11} className="faint">
                  No lines yet.
                </td>
              </tr>
            )}
            {lines.map((l, i) => {
              const uc = unitCost(l);
              return (
                <tr key={i}>
                  <td className="faint">{i + 1}</td>
                  <td style={{ minWidth: 200 }}>{editable ? <input className="o-input" value={l.item} maxLength={300} onChange={(e) => set(i, { item: e.target.value })} aria-label={`Line ${i + 1} item`} /> : l.item}</td>
                  <td className="num" style={{ width: 90 }}>
                    {editable ? <input className="o-input" type="number" min={0} step="any" value={l.qty} onChange={(e) => set(i, { qty: num(e.target.value) })} aria-label={`Line ${i + 1} quantity`} style={{ textAlign: 'right' }} /> : l.qty.toLocaleString('en-IN')}
                  </td>
                  <td style={{ width: 84 }}>
                    {editable ? (
                      <select className="o-select" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} aria-label={`Line ${i + 1} unit`}>
                        {[...new Set([...UNITS, l.unit])].map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    ) : (
                      l.unit
                    )}
                  </td>
                  <td className="num" style={{ width: 120 }}>{cell(i, 'material')}</td>
                  <td className="num" style={{ width: 120 }}>{cell(i, 'labour')}</td>
                  <td className="num" style={{ width: 120 }}>{cell(i, 'other')}</td>
                  <td className="num">{uc ? <strong>{m(uc)}</strong> : <span className="bad">missing</span>}</td>
                  <td className="num">{m(l.qty * uc)}</td>
                  <td className="num">{priced && l.rate ? m(l.rate) : uc && mk ? m(suggestedRate(uc, mk)) : '-'}</td>
                  {editable && (
                    <td>
                      <Button size="small" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}>
                        ×
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr style={{ background: 'var(--line-2)' }}>
                <td />
                <td colSpan={3}>
                  <strong>Totals</strong>
                </td>
                <td className="num">{m(tot.material)}</td>
                <td className="num">{m(tot.labour)}</td>
                <td className="num">{m(tot.other)}</td>
                <td />
                <td className="num">
                  <strong>{m(tot.cost)}</strong>
                </td>
                <td className="num">
                  <strong>{tot.sell ? m(tot.sell) : '-'}</strong>
                </td>
                {editable && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="o-form-row" style={{ padding: 16, alignItems: 'flex-start', borderTop: '1px solid var(--line-2)' }}>
        <div className="o-stack" style={{ gap: 10, flex: '0 0 260px' }}>
          <label className="o-field">
            Markup on cost %
            {editable ? <input className="o-input" type="number" min={0} max={500} step="0.5" value={markup} placeholder="e.g. 18" onChange={(e) => setMarkup(e.target.value)} /> : <strong style={{ fontSize: 15 }}>{savedMarkup ? `${savedMarkup}%` : '-'}</strong>}
          </label>
          <div className="p-dl" style={{ fontSize: 13 }}>
            <div>
              <span>Total cost</span>
              <strong>{m(tot.cost)}</strong>
            </div>
            <div>
              <span>{priced ? 'Selling value' : 'Suggested value'}</span>
              <strong>{tot.sell ? m(tot.sell) : '-'}</strong>
            </div>
            <div>
              <span>Margin</span>
              <strong>{tot.sell ? `${margin.toFixed(1)}%` : '-'}</strong>
            </div>
          </div>
        </div>
        <label className="o-field" style={{ flex: '1 1 320px' }}>
          Costing basis: assumptions, inclusions and exclusions (sales sees this)
          {editable ? (
            <textarea className="o-textarea" rows={6} value={notes} maxLength={8000} placeholder="e.g. Steel at ₹62/kg ex-Kochi. Painting: 1 coat primer. Excludes civil work, crane hire and GST." onChange={(e) => setNotes(e.target.value)} />
          ) : (
            <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0', fontSize: 13, color: 'var(--ink)' }}>{savedNotes || <span className="faint">None</span>}</p>
          )}
        </label>
      </div>
      {editable && (
        <div className="o-row" style={{ padding: '0 16px 16px', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {missing ? <Chip tone="warn">{missing} line{missing === 1 ? '' : 's'} without cost</Chip> : dirty ? 'Save the costing before pricing is done.' : 'All lines costed.'}
          </span>
          <div className="o-row">
            <Button disabled={busy || !dirty} onClick={save}>
              Save costing
            </Button>
            {canFinish && (
              <Button
                variant="primary"
                disabled={busy || dirty || missing > 0 || lines.length === 0}
                title={dirty ? 'Save the costing first' : undefined}
                onClick={() => confirm('Mark pricing done? The project and documents lock for sales, and the quotation goes to sales with the suggested rates.') && run(() => pricingDoneAction({ id: enquiryId }), 'Pricing done. Sent to sales.')}
              >
                Pricing done
              </Button>
            )}
          </div>
        </div>
      )}
      {editable && (
        <SaveBar
          dirty={dirty}
          busy={busy}
          what="the costing sheet"
          impact="Sales still sees nothing until you press Pricing done."
          onDiscard={() => {
            setLines(savedLines.length ? savedLines : [blank()]);
            setMarkup(String(savedMarkup || ''));
            setNotes(savedNotes);
          }}
          onSave={save}
        />
      )}
    </div>
  );
}
