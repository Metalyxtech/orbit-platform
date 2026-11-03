'use client';
import { useState } from 'react';
import { Button, DayBarChart, PhoneDayTabs, Stepper, WeekGrid } from '@orbit/ui';
import { parseCell, round2 } from '../../calc';
import type { WeekView } from '../../server/week';
import { RowPickers } from './RowPickers';
import { useWeekEditor } from './useWeekEditor';
import { WeekFrame } from './WeekFrame';

/** Form "Weekly grid": one row per project and cost code, one column per day. */
export function WeekGridForm({ view, draftKey }: { view: WeekView; draftKey: string }) {
  const e = useWeekEditor(view, draftKey);
  const { rows, totals, readOnly } = e;
  const [day, setDay] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    const i = view.days.findIndex((d) => d.date === today);
    return i >= 0 ? i : 0;
  });

  return (
    <WeekFrame
      e={e}
      actions={
        <>
          <Button onClick={e.copyLastWeek}>Copy last week</Button>
          <Button onClick={() => e.addRow()}>Add row</Button>
        </>
      }
    >
      {/* Desktop grid */}
      <div className="o-panel flush desk-only" style={{ overflowX: 'auto' }}>
        <WeekGrid
          days={view.days}
          rows={rows.map((r, i) => ({ key: r.key, hours: r.hours, label: <RowPickers e={e} r={r} onPick={(p) => e.updateRow(i, p)} /> }))}
          rowTotals={totals.rowTotals}
          dayTotals={totals.dayTotals}
          overDays={totals.overDays}
          total={totals.total}
          readOnly={readOnly}
          parse={(t) => parseCell(t, view.rules.stepHours)}
          onChange={e.setHours}
          onPaste={(i, start, values) => {
            const hours = [...rows[i].hours];
            values.forEach((v, k) => (hours[start + k] = v));
            e.updateRow(i, { hours });
          }}
          onRemoveRow={e.removeRow}
          onError={(m) => e.toast(m, 'bad')}
        />
      </div>
      <div className="o-legend desk-only">
        <span>
          <i style={{ background: 'var(--hatch)' }} />
          Over {view.rules.stdDayHours} h standard day
        </span>
        <span>
          <i style={{ background: '#fafbfa' }} />
          Weekly off ({view.days.filter((d) => d.weeklyOff).map((d) => d.name).join(', ') || 'none'})
        </span>
        <span>Use the arrow keys to move, type to enter hours</span>
      </div>

      {/* Phone: day tabs + stepper */}
      <div className="phone-only">
        <PhoneDayTabs
          days={view.days.map((d, i) => ({ name: d.name, total: totals.dayTotals[i], over: totals.overDays[i], off: d.weeklyOff }))}
          selected={day}
          onSelect={setDay}
        />
        <div className="o-stack" style={{ marginTop: 12 }}>
          {rows.map((r, i) => (
            <div className="o-panel" key={r.key}>
              <strong>{r.projectLabel || 'Choose project'}</strong>
              <div className="muted cond" style={{ fontSize: 12, marginBottom: 8 }}>
                {r.costCodeLabel || 'Choose cost code'}
              </div>
              {(!r.projectId || !r.costCodeId) && !readOnly && (
                <div style={{ marginBottom: 8 }}>
                  <RowPickers e={e} r={r} onPick={(p) => e.updateRow(i, p)} />
                </div>
              )}
              <Stepper value={r.hours[day]} onChange={(v) => e.setHours(i, day, v)} disabled={readOnly} />
              {totals.dayTotals[day] > view.rules.stdDayHours && r.hours[day] > 0 && (
                <div className="hivis" style={{ fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                  {round2(totals.dayTotals[day] - view.rules.stdDayHours).toFixed(1)} h over standard day
                </div>
              )}
            </div>
          ))}
          {!readOnly && (
            <button type="button" className="o-btn block" style={{ borderStyle: 'dashed' }} onClick={() => e.addRow()}>
              Add project or cost code
            </button>
          )}
        </div>
      </div>

      <div className="o-panel desk-only">
        <div className="o-panel-head">
          <h2>Hours by day</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            Standard {view.rules.stdDayHours} h, overtime hatched
          </span>
        </div>
        <DayBarChart days={view.days.map((d, i) => ({ label: d.name, hours: totals.dayTotals[i] }))} standard={view.rules.stdDayHours} />
      </div>
    </WeekFrame>
  );
}
