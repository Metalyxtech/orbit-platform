'use client';
import { useState } from 'react';
import { Button } from '@orbit/ui';
import { round2 } from '../../calc';
import type { WeekRow, WeekView } from '../../server/week';
import { HoursInput } from './HoursInput';
import { RowPickers } from './RowPickers';
import { useWeekEditor } from './useWeekEditor';
import { WeekFrame } from './WeekFrame';

const lineKey = (rowKey: string, d: number) => `${rowKey}:${d}`;

/**
 * Form "Day by day": one card per day with a line per job worked that day. It stores the same
 * rows as the weekly grid (project + cost code with hours per day), so either form can be used.
 */
export function DailyLogForm({ view, draftKey }: { view: WeekView; draftKey: string }) {
  const e = useWeekEditor(view, draftKey);
  const { rows, totals, readOnly } = e;
  const [open, setOpen] = useState(() => new Set<string>());
  const std = view.rules.stdDayHours;

  // A row shows on a day when it has hours that day, has no hours yet (copied jobs), or was just added there.
  const linesFor = (d: number) =>
    rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.hours[d] > 0 || r.hours.every((h) => h === 0) || open.has(lineKey(r.key, d)));

  const addLine = (d: number) => {
    const key = e.addRow();
    setOpen((s) => new Set(s).add(lineKey(key, d)));
  };

  /** Picking a job on one day's line must not move that row's hours on other days. */
  const pick = (r: WeekRow, i: number, d: number, patch: Pick<WeekRow, 'projectId' | 'costCodeId'>) => {
    const elsewhere = r.hours.some((h, k) => k !== d && h > 0);
    const twin = patch.projectId && patch.costCodeId ? rows.findIndex((x, j) => j !== i && x.projectId === patch.projectId && x.costCodeId === patch.costCodeId) : -1;
    if (twin >= 0) {
      // Same job already has a row: put this day's hours there.
      const hours = [...rows[twin].hours];
      hours[d] = round2(hours[d] + r.hours[d]);
      e.updateRow(twin, { hours });
      setOpen((s) => new Set(s).add(lineKey(rows[twin].key, d)));
      if (elsewhere) {
        const own = [...r.hours];
        own[d] = 0;
        e.updateRow(i, { hours: own });
      } else e.removeRow(i);
      return;
    }
    if (!elsewhere) return e.updateRow(i, patch);
    const own = [...r.hours];
    const moved = own[d];
    own[d] = 0;
    e.updateRow(i, { hours: own });
    const hours = Array(7).fill(0);
    hours[d] = moved;
    const key = e.addRow({ ...patch, hours });
    setOpen((s) => new Set(s).add(lineKey(key, d)));
  };

  const removeLine = (r: WeekRow, i: number, d: number) => {
    const others = r.hours.some((h, k) => k !== d && h > 0);
    if (others) e.setHours(i, d, 0);
    else e.removeRow(i);
  };

  return (
    <WeekFrame e={e} actions={<Button onClick={e.copyLastWeek}>Copy last week's jobs</Button>}>
      <div className="o-daylog">
        {view.days.map((day, d) => {
          const lines = linesFor(d);
          const total = totals.dayTotals[d];
          const over = round2(total - std);
          return (
            <section key={day.date} className={`o-panel o-daycard${day.weeklyOff ? ' off' : ''}`} aria-label={`${day.name} ${day.label}`}>
              <header className="o-daycard-head">
                <div>
                  <strong>{day.name}</strong> <span className="muted">{day.label}</span>
                  {day.weeklyOff && <span className="o-chip">Weekly off</span>}
                </div>
                <div className="o-row" style={{ gap: 8 }}>
                  {over > 0 && <span className="o-chip warn">{over.toFixed(1)} h over</span>}
                  <span className="o-daycard-total">{total.toFixed(1)} h</span>
                </div>
              </header>
              {lines.length === 0 && <p className="faint o-daycard-empty">{readOnly ? 'No hours.' : 'No hours yet. Add the jobs you worked on.'}</p>}
              {lines.map(({ r, i }) => (
                <div key={r.key} className="o-dayline">
                  <div className="o-dayline-pick">
                    <RowPickers e={e} r={r} onPick={(p) => pick(r, i, d, p)} />
                  </div>
                  <HoursInput
                    value={r.hours[d]}
                    step={view.rules.stepHours}
                    disabled={readOnly}
                    onChange={(v) => e.setHours(i, d, v)}
                    onError={(m) => e.toast(m, 'bad')}
                  />
                  {!readOnly && (
                    <button type="button" className="o-btn small" aria-label="Remove line" title="Remove line" onClick={() => removeLine(r, i, d)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <button type="button" className="o-dayline-add" onClick={() => addLine(d)}>
                  + Add a job for {day.name}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </WeekFrame>
  );
}
