'use client';
import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { dateLabel } from '@orbit/core/i18n';
import { Button, Chip, EmptyState, TopBar, useLang } from '@orbit/ui';
import { prodT, termT } from '../i18n';
import { fmtDate, fmtQty, OP_STATUS, pct, SHIFTS, type OpStatus } from '../config';
import { reportOutputAction } from '../actions';
import type { FloorWo } from '../server';
import { PageHead, PriorityChip, Progress, woHref } from './ui';
import { useRun } from './useRun';

/** The supervisor's daily production report: one screen, every work order on the floor, one row per operation. */
export function DailyReportClient({ wos }: { wos: FloorWo[] }) {
  const { busy, run } = useRun();
  const lang = useLang();
  const { t, term } = useMemo(() => ({ t: prodT(lang), term: termT(lang) }), [lang]);
  const t0 = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(t0);
  const [shift, setShift] = useState(SHIFTS[0]);
  const [rows, setRows] = useState<Record<string, { qty: string; hours: string; workers: string; remarks: string; m: Record<string, string> }>>({});
  const row = (id: string) => rows[id] ?? { qty: '', hours: '', workers: '', remarks: '', m: {} };
  const setRow = (id: string, patch: Partial<ReturnType<typeof row>>) => setRows({ ...rows, [id]: { ...row(id), ...patch } });
  const filled = Object.entries(rows).filter(([, r]) => Number(r.qty) > 0 || Number(r.hours) > 0);

  async function saveAll() {
    let ok = 0;
    for (const [opId, r] of filled) {
      const wo = wos.find((w) => w.ops.some((o) => o.id === opId))!;
      const measures = Object.fromEntries(Object.entries(r.m).filter(([, v]) => v !== ''));
      const res = await run(() => reportOutputAction({ workOrderId: wo.id, operationId: opId, day, qty: Number(r.qty) || 0, hours: Number(r.hours) || 0, workers: Number(r.workers) || 0, shift, remarks: r.remarks, measures }));
      if (res) {
        ok++;
        setRows((x) => {
          const n = { ...x };
          delete n[opId];
          return n;
        });
      }
    }
    return ok;
  }

  return (
    <>
      <TopBar crumbs={[t('production'), t('dailyReport')]} />
      <div className="o-page">
        <PageHead title={t('dailyReport')} lead={t('reportLead')}>
          <label className="o-field">
            {t('date')}
            <input className="o-input" type="date" value={day} max={t0} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="o-field">
            {t('shift')}
            <select className="o-select" value={shift} onChange={(e) => setShift(e.target.value)}>
              {SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {term(s)}
                </option>
              ))}
            </select>
          </label>
        </PageHead>
        {wos.length === 0 && <EmptyState title={t('noWos')} />}
        {wos.map((w) => (
          <div key={w.id} className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2 style={{ fontSize: 15 }}>
                <Link href={woHref(w.id)}>{w.number}</Link> {w.title} <PriorityChip priority={w.priority} />
              </h2>
              <span className="muted" style={{ fontSize: 12 }}>
                {w.trade} · {fmtQty(w.qty)} {w.unit} · {t('due', { date: w.due ? dateLabel(lang, w.due, { day: 'numeric', month: 'short', year: 'numeric' }) : fmtDate(w.due) })} ·{' '}
                <Link href={woHref(w.id)}>{w.drawings ? (w.drawings === 1 ? t('oneDrawing') : t('drawings', { n: w.drawings })) : t('noDrawings')}</Link>
              </span>
            </div>
            <div className="o-scroll">
              <table className="o-table">
                <thead>
                  <tr>
                    <th>{t('operation')}</th>
                    <th>{t('progress')}</th>
                    <th className="num">{w.measures.length ? t('goodQtyToday') : t('qtyToday')}</th>
                    <th className="num">{t('hours')}</th>
                    <th className="num">{t('people')}</th>
                    <th>{t('remarks')}</th>
                  </tr>
                </thead>
                <tbody>
                  {w.ops.map((o) => {
                    const open = o.status === 'pending' || o.status === 'running';
                    const r = row(o.id);
                    const entering = open && w.measures.length > 0 && (Number(r.qty) > 0 || Number(r.hours) > 0);
                    return (
                      <Fragment key={o.id}>
                      <tr>
                        <td>
                          {o.name} {!open && <Chip tone={OP_STATUS[o.status as OpStatus].tone}>{term(OP_STATUS[o.status as OpStatus].label)}</Chip>}
                        </td>
                        <td style={{ width: 170 }}>
                          <Progress value={pct(o.doneQty, w.qty)} tone={o.status === 'rework' ? 'bad' : undefined} />
                        </td>
                        {open ? (
                          <>
                            <td className="num" style={{ width: 100 }}>
                              <input className="o-input" type="number" min={0} step="any" value={r.qty} aria-label={`${w.number} ${o.name} ${w.measures.length ? t('goodQtyToday') : t('qtyToday')}`} onChange={(e) => setRow(o.id, { qty: e.target.value })} />
                            </td>
                            <td className="num" style={{ width: 90 }}>
                              <input className="o-input" type="number" min={0} step="0.5" value={r.hours} aria-label={`${w.number} ${o.name} ${t('hours')}`} onChange={(e) => setRow(o.id, { hours: e.target.value })} />
                            </td>
                            <td className="num" style={{ width: 80 }}>
                              <input className="o-input" type="number" min={0} value={r.workers} aria-label={`${w.number} ${o.name} ${t('people')}`} onChange={(e) => setRow(o.id, { workers: e.target.value })} />
                            </td>
                            <td>
                              <input className="o-input" value={r.remarks} maxLength={1000} aria-label={`${w.number} ${o.name} ${t('remarks')}`} onChange={(e) => setRow(o.id, { remarks: e.target.value })} />
                            </td>
                          </>
                        ) : (
                          <td colSpan={4} className="faint" style={{ fontSize: 12 }}>
                            {t('complete')}
                          </td>
                        )}
                      </tr>
                      {entering && (
                        <tr>
                          <td colSpan={6} style={{ background: 'var(--paper)' }}>
                            <div className="o-row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                              {w.measures.map((f) => (
                                <label key={f.id} className="o-field" style={{ margin: 0, fontSize: 12, minWidth: 120 }}>
                                  {term(f.label)}
                                  {f.unit ? ` (${f.unit})` : ''}
                                  {f.options ? (
                                    <select className="o-select" value={r.m[f.id] ?? ''} onChange={(e) => setRow(o.id, { m: { ...r.m, [f.id]: e.target.value } })}>
                                      <option value="">-</option>
                                      {f.options.map((x) => (
                                        <option key={x} value={x}>
                                          {term(x)}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      className="o-input"
                                      type={f.type === 'number' ? 'number' : 'text'}
                                      min={0}
                                      step="any"
                                      value={r.m[f.id] ?? ''}
                                      maxLength={200}
                                      onChange={(e) => setRow(o.id, { m: { ...r.m, [f.id]: e.target.value } })}
                                    />
                                  )}
                                </label>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {wos.length > 0 && (
          <div className="o-row" style={{ position: 'sticky', bottom: 0, background: 'var(--paper)', padding: '10px 0' }}>
            <Button variant="primary" disabled={busy || !filled.length} onClick={saveAll}>
              {t('saveReport', { n: filled.length })}
            </Button>
            <span className="muted" style={{ fontSize: 12 }}>
              {t('saveHint')}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
