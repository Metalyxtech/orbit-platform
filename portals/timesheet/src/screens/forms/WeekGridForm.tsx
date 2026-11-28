'use client';
import { useState } from 'react';
import { Button, DayBarChart, PhoneDayTabs, Stepper, WeekGrid } from '@orbit/ui';
import { parseCell, round2 } from '../../calc';
import type { WeekView } from '../../server/week';
import { useTs } from '../useTs';
import { RowPickers } from './RowPickers';
import { useWeekEditor } from './useWeekEditor';
import { WeekFrame } from './WeekFrame';

/** Form "Weekly grid": one row per project and cost code, one column per day. */
export function WeekGridForm({ view, draftKey }: { view: WeekView; draftKey: string }) {
  const e = useWeekEditor(view, draftKey);
  const { rows, totals, readOnly } = e;
  const { t, day: dayOf, date: dateOf } = useTs();
  // Day names and dates in the person's language.
  const days = view.days.map((d) => ({ ...d, name: dayOf(d.date), label: dateOf(d.date) }));
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
          <Button onClick={e.copyLastWeek}>{t('copyLastWeek')}</Button>
          <Button onClick={() => e.addRow()}>{t('addRow')}</Button>
        </>
      }
    >
      {/* Desktop grid */}
      <div className="o-panel flush desk-only" style={{ overflowX: 'auto' }}>
        <WeekGrid
          days={days}
          labels={{ rows: t('projectAndCostCode'), total: t('total'), dayTotal: t('dayTotal'), hours: t('hours') }}
          rows={rows.map((r, i) => ({ key: r.key, hours: r.hours, label: <RowPickers e={e} r={r} onPick={(p) => e.updateRow(i, p)} /> }))}
          rowTotals={totals.rowTotals}
          dayTotals={totals.dayTotals}
          overDays={totals.overDays}
          total={totals.total}
          readOnly={readOnly}
          parse={(text) => {
            const r = parseCell(text, view.rules.stepHours);
            return r.ok ? r : { ok: false, error: t(r.key) };
          }}
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
          {t('overStdDay', { h: view.rules.stdDayHours })}
        </span>
        <span>
          <i style={{ background: '#fafbfa' }} />
          {t('weeklyOffList', { days: days.filter((d) => d.weeklyOff).map((d) => d.name).join(', ') || t('none') })}
        </span>
        <span>{t('keysHint')}</span>
      </div>

      {/* Phone: day tabs + stepper */}
      <div className="phone-only">
        <PhoneDayTabs
          days={days.map((d, i) => ({ name: d.name, total: totals.dayTotals[i], over: totals.overDays[i], off: d.weeklyOff }))}
          selected={day}
          onSelect={setDay}
        />
        <div className="o-stack" style={{ marginTop: 12 }}>
          {rows.map((r, i) => (
            <div className="o-panel" key={r.key}>
              <strong>{r.projectLabel || t('chooseProject')}</strong>
              <div className="muted cond" style={{ fontSize: 12, marginBottom: 8 }}>
                {r.costCodeLabel || t('chooseCostCode')}
              </div>
              {(!r.projectId || !r.costCodeId) && !readOnly && (
                <div style={{ marginBottom: 8 }}>
                  <RowPickers e={e} r={r} onPick={(p) => e.updateRow(i, p)} />
                </div>
              )}
              <Stepper value={r.hours[day]} onChange={(v) => e.setHours(i, day, v)} disabled={readOnly} />
              {totals.dayTotals[day] > view.rules.stdDayHours && r.hours[day] > 0 && (
                <div className="hivis" style={{ fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                  {t('hOverStd', { h: round2(totals.dayTotals[day] - view.rules.stdDayHours).toFixed(1) })}
                </div>
              )}
            </div>
          ))}
          {!readOnly && (
            <button type="button" className="o-btn block" style={{ borderStyle: 'dashed' }} onClick={() => e.addRow()}>
              {t('addProjectOrCode')}
            </button>
          )}
        </div>
      </div>

      <div className="o-panel desk-only">
        <div className="o-panel-head">
          <h2>{t('hoursByDay')}</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            {t('stdHatched', { h: view.rules.stdDayHours })}
          </span>
        </div>
        <DayBarChart days={days.map((d, i) => ({ label: d.name, hours: totals.dayTotals[i] }))} standard={view.rules.stdDayHours} />
      </div>
    </WeekFrame>
  );
}
