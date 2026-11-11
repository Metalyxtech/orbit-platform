'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Chip, EmptyState, TopBar } from '@orbit/ui';
import { fmtDate, fmtQty, OP_STATUS, pct, SHIFTS, type OpStatus } from '../config';
import { reportOutputAction } from '../actions';
import type { FloorWo } from '../server';
import { PageHead, PriorityChip, Progress, woHref } from './ui';
import { useRun } from './useRun';

/** The supervisor's daily production report: one screen, every work order on the floor, one row per operation. */
export function DailyReportClient({ wos }: { wos: FloorWo[] }) {
  const { busy, run } = useRun();
  const t0 = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(t0);
  const [shift, setShift] = useState(SHIFTS[0]);
  const [rows, setRows] = useState<Record<string, { qty: string; hours: string; workers: string; remarks: string }>>({});
  const row = (id: string) => rows[id] ?? { qty: '', hours: '', workers: '', remarks: '' };
  const setRow = (id: string, patch: Partial<ReturnType<typeof row>>) => setRows({ ...rows, [id]: { ...row(id), ...patch } });
  const filled = Object.entries(rows).filter(([, r]) => Number(r.qty) > 0 || Number(r.hours) > 0);

  async function saveAll() {
    let ok = 0;
    for (const [opId, r] of filled) {
      const wo = wos.find((w) => w.ops.some((o) => o.id === opId))!;
      const res = await run(() => reportOutputAction({ workOrderId: wo.id, operationId: opId, day, qty: Number(r.qty) || 0, hours: Number(r.hours) || 0, workers: Number(r.workers) || 0, shift, remarks: r.remarks }));
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
      <TopBar crumbs={['Production', 'Daily production report']} />
      <div className="o-page">
        <PageHead title="Daily production report" lead="Enter today’s output and hours for each operation, then save once.">
          <label className="o-field">
            Date
            <input className="o-input" type="date" value={day} max={t0} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="o-field">
            Shift
            <select className="o-select" value={shift} onChange={(e) => setShift(e.target.value)}>
              {SHIFTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </PageHead>
        {wos.length === 0 && <EmptyState title="No work orders on the shop floor. They appear here once released." />}
        {wos.map((w) => (
          <div key={w.id} className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2 style={{ fontSize: 15 }}>
                <Link href={woHref(w.id)}>{w.number}</Link> {w.title} <PriorityChip priority={w.priority} />
              </h2>
              <span className="muted" style={{ fontSize: 12 }}>
                {w.trade} · {fmtQty(w.qty)} {w.unit} · due {fmtDate(w.due)} ·{' '}
                <Link href={woHref(w.id)}>{w.drawings ? `${w.drawings} drawing${w.drawings === 1 ? '' : 's'}` : 'no drawings'}</Link>
              </span>
            </div>
            <div className="o-scroll">
              <table className="o-table">
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Progress</th>
                    <th className="num">Qty today</th>
                    <th className="num">Hours</th>
                    <th className="num">People</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {w.ops.map((o) => {
                    const open = o.status === 'pending' || o.status === 'running';
                    const r = row(o.id);
                    return (
                      <tr key={o.id}>
                        <td>
                          {o.name} {!open && <Chip tone={OP_STATUS[o.status as OpStatus].tone}>{OP_STATUS[o.status as OpStatus].label}</Chip>}
                        </td>
                        <td style={{ width: 170 }}>
                          <Progress value={pct(o.doneQty, w.qty)} tone={o.status === 'rework' ? 'bad' : undefined} />
                        </td>
                        {open ? (
                          <>
                            <td className="num" style={{ width: 100 }}>
                              <input className="o-input" type="number" min={0} step="any" value={r.qty} aria-label={`${w.number} ${o.name} quantity`} onChange={(e) => setRow(o.id, { qty: e.target.value })} />
                            </td>
                            <td className="num" style={{ width: 90 }}>
                              <input className="o-input" type="number" min={0} step="0.5" value={r.hours} aria-label={`${w.number} ${o.name} hours`} onChange={(e) => setRow(o.id, { hours: e.target.value })} />
                            </td>
                            <td className="num" style={{ width: 80 }}>
                              <input className="o-input" type="number" min={0} value={r.workers} aria-label={`${w.number} ${o.name} people`} onChange={(e) => setRow(o.id, { workers: e.target.value })} />
                            </td>
                            <td>
                              <input className="o-input" value={r.remarks} maxLength={1000} aria-label={`${w.number} ${o.name} remarks`} onChange={(e) => setRow(o.id, { remarks: e.target.value })} />
                            </td>
                          </>
                        ) : (
                          <td colSpan={4} className="faint" style={{ fontSize: 12 }}>
                            {o.status === 'rework' ? 'QC sent it back: mark rework done on the work order.' : o.status === 'awaiting_qc' ? 'Complete; waiting for QC.' : 'Complete.'}
                          </td>
                        )}
                      </tr>
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
              Save report ({filled.length} {filled.length === 1 ? 'line' : 'lines'})
            </Button>
            <span className="muted" style={{ fontSize: 12 }}>
              Lines with a problem stay on the screen with the reason; the rest are saved.
            </span>
          </div>
        )}
      </div>
    </>
  );
}
