'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Chip, TopBar } from '@orbit/ui';
import { fmtDate, fmtQty, OP_STATUS, pct, SHIFTS, WO_FLOW, WO_STATUS } from '../config';
import {
  cancelWorkOrderAction,
  closeNcrAction,
  decideReleaseAction,
  dispatchAction,
  finalReworkDoneAction,
  inspectAction,
  issueMaterialsAction,
  reportOutputAction,
  reworkDoneAction,
  submitForReleaseAction,
} from '../actions';
import type { WoDetail } from '../server';
import { PriorityChip, Progress, StatusChip } from './ui';
import { useRun } from './useRun';

/** One work order: plan, materials, operations with progress, QC, NCRs, history and the next step for each role. */
export function WorkOrderView({ d }: { d: WoDetail }) {
  const w = d.wo;
  const at = WO_FLOW.indexOf(w.status);
  const openNcrs = d.ncrs.filter((n) => n.status === 'open');
  return (
    <>
      <TopBar crumbs={['Production', 'Work orders', w.number]} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <div className="o-row" style={{ flexWrap: 'wrap' }}>
              <h1>
                {w.number} {w.title}
              </h1>
              <StatusChip status={w.status} />
              <PriorityChip priority={w.priority} />
              {w.late && <Chip tone="bad">Late</Chip>}
              {openNcrs.length > 0 && <Chip tone="bad">{openNcrs.length} open NCR</Chip>}
            </div>
            <p>
              {d.trade.name} · {fmtQty(w.qty)} {w.unit}
              {w.customer ? ` · ${w.customer}` : ''}
              {w.salesOrder ? ` · from ${w.salesOrder}` : ''} · due {fmtDate(w.due)} · planned by {w.createdByName || '-'}
              {w.releasedByName ? ` · released by ${w.releasedByName}` : ''}
            </p>
          </div>
          {d.can.edit && (
            <Link className="o-btn" href={`/production/edit?id=${w.id}`}>
              Edit plan
            </Link>
          )}
        </div>

        {w.status !== 'cancelled' && (
          <ol className="p-track" aria-label="Stages">
            {WO_FLOW.map((s, i) => (
              <li key={s} className={i < at ? 'done' : i === at ? 'now' : ''}>
                {WO_STATUS[s].label}
              </li>
            ))}
          </ol>
        )}

        {w.status === 'draft' && w.returnedNote && (
          <div className="o-panel" style={{ borderLeft: '4px solid var(--hivis, #d97706)' }}>
            <strong>Sent back by the production manager</strong>
            <p style={{ margin: '6px 0 0' }}>“{w.returnedNote}”</p>
          </div>
        )}

        <div className="o-cols-wide">
          <div className="o-stack">
            <OperationsPanel d={d} />
            {d.can.report && <ReportPanel d={d} />}
            {d.can.inspect && d.me !== 'supervisor' && <InspectPanel d={d} />}
            <MaterialsPanel d={d} />
            {d.ncrs.length > 0 && <NcrPanel d={d} />}
            {d.reports.length > 0 && (
              <div className="o-panel flush">
                <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                  <h2>Production reports</h2>
                </div>
                <div className="o-scroll">
                  <table className="o-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Operation</th>
                        <th className="num">Qty</th>
                        <th className="num">Hours</th>
                        <th className="num">People</th>
                        <th>Shift</th>
                        <th>Remarks</th>
                        <th>By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.reports.map((r) => (
                        <tr key={r.id}>
                          <td>{fmtDate(r.day)}</td>
                          <td>{r.operation}</td>
                          <td className="num">{fmtQty(r.qty)}</td>
                          <td className="num">{r.hours || '-'}</td>
                          <td className="num">{r.workers || '-'}</td>
                          <td>{r.shift ?? '-'}</td>
                          <td className="muted">{r.remarks ?? ''}</td>
                          <td className="muted">{r.by}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {d.inspections.length > 0 && (
              <div className="o-panel flush">
                <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                  <h2>Inspections</h2>
                </div>
                <table className="o-table">
                  <tbody>
                    {d.inspections.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <strong>{i.number}</strong> {i.operation}
                          <div className="faint" style={{ fontSize: 11 }}>
                            {(i.checklist as { item: string; ok: boolean }[]).filter((c) => !c.ok).map((c) => `✕ ${c.item}`).join(' · ') || 'All checks OK'}
                            {i.remarks ? ` · ${i.remarks}` : ''}
                          </div>
                        </td>
                        <td>{i.result === 'pass' ? <Chip tone="ok">Passed</Chip> : <Chip tone="bad">Failed</Chip>}</td>
                        <td className="muted">
                          {i.by} · {new Date(i.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="o-panel">
              <h2>History</h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {d.events.map((x) => (
                  <li key={x.id} style={{ fontSize: 13 }}>
                    {x.text}
                    <div className="faint" style={{ fontSize: 11 }}>
                      {x.by || 'Orbit'} · {new Date(x.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="o-stack">
            <NextStep d={d} />
            <div className="o-panel">
              <h2>{d.trade.name} form</h2>
              <div className="p-dl" style={{ fontSize: 13 }}>
                {d.trade.fields.map((f) => (
                  <div key={f.id}>
                    <span>{f.label}</span>
                    <strong>
                      {(w.fields as Record<string, string>)[f.id] || '-'}
                      {(w.fields as Record<string, string>)[f.id] && f.unit ? ` ${f.unit}` : ''}
                    </strong>
                  </div>
                ))}
              </div>
              {w.notes && <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: '12px 0 0' }}>{w.notes}</p>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function OperationsPanel({ d }: { d: WoDetail }) {
  const { busy, run } = useRun();
  const [rework, setRework] = useState<{ id: string; text: string } | null>(null);
  const w = d.wo;
  return (
    <div className="o-panel flush">
      <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
        <h2>Operations</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          {d.ops.filter((o) => o.status === 'done').length} of {d.ops.length} done
        </span>
      </div>
      <table className="o-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Operation</th>
            <th>Status</th>
            <th>Progress</th>
            <th className="num">Done</th>
            <th className="num">Hours</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {d.ops.map((o, i) => (
            <tr key={o.id}>
              <td className="faint">{i + 1}</td>
              <td>
                {o.name} {o.qcRequired && <Chip tone="grey">QC</Chip>}
              </td>
              <td>
                <Chip tone={OP_STATUS[o.status].tone}>{OP_STATUS[o.status].label}</Chip>
              </td>
              <td style={{ width: 180 }}>
                <Progress value={pct(o.doneQty, w.qty)} tone={o.status === 'rework' ? 'bad' : undefined} />
              </td>
              <td className="num">
                {fmtQty(o.doneQty)} / {fmtQty(w.qty)} {w.unit}
              </td>
              <td className="num">{o.hours || '-'}</td>
              <td>
                {o.status === 'rework' && d.can.reworkDone && (
                  <Button size="small" variant="primary" disabled={busy} onClick={() => setRework({ id: o.id, text: '' })}>
                    Rework done
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rework && (
        <div className="o-row" style={{ padding: 12, borderTop: '1px solid var(--line)', alignItems: 'flex-end' }}>
          <label className="o-field" style={{ flex: 1 }}>
            What was corrected?
            <input className="o-input" value={rework.text} maxLength={1000} onChange={(e) => setRework({ ...rework, text: e.target.value })} />
          </label>
          <Button variant="primary" disabled={busy} onClick={async () => (await run(() => reworkDoneAction({ operationId: rework.id, remarks: rework.text }), 'Sent back to QC.')) && setRework(null)}>
            Send to QC
          </Button>
          <Button onClick={() => setRework(null)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

function ReportPanel({ d }: { d: WoDetail }) {
  const { busy, run } = useRun();
  const open = d.ops.filter((o) => o.status === 'pending' || o.status === 'running');
  const [f, setF] = useState({ operationId: open[0]?.id ?? '', day: new Date().toISOString().slice(0, 10), qty: '', hours: '', workers: '', shift: SHIFTS[0], remarks: '' });
  if (!open.length) return null;
  return (
    <div className="o-panel">
      <h2>Report today’s output</h2>
      <div className="o-form-row">
        <label className="o-field" style={{ flex: '2 1 200px' }}>
          Operation
          <select className="o-select" value={f.operationId} onChange={(e) => setF({ ...f, operationId: e.target.value })}>
            {open.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({fmtQty(o.doneQty)} / {fmtQty(d.wo.qty)} done)
              </option>
            ))}
          </select>
        </label>
        <label className="o-field">
          Date
          <input className="o-input" type="date" value={f.day} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, day: e.target.value })} />
        </label>
        <label className="o-field">
          Qty done ({d.wo.unit})
          <input className="o-input" type="number" min={0} step="any" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
        </label>
        <label className="o-field">
          Hours
          <input className="o-input" type="number" min={0} step="0.5" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} />
        </label>
        <label className="o-field">
          People
          <input className="o-input" type="number" min={0} value={f.workers} onChange={(e) => setF({ ...f, workers: e.target.value })} />
        </label>
        <label className="o-field">
          Shift
          <select className="o-select" value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}>
            {SHIFTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="o-row" style={{ marginTop: 10, alignItems: 'flex-end' }}>
        <label className="o-field" style={{ flex: 1 }}>
          Remarks (breakdown, delay, material shortage…)
          <input className="o-input" value={f.remarks} maxLength={1000} onChange={(e) => setF({ ...f, remarks: e.target.value })} />
        </label>
        <Button
          variant="primary"
          disabled={busy || !f.operationId}
          onClick={async () =>
            (await run(
              () => reportOutputAction({ workOrderId: d.wo.id, operationId: f.operationId, day: f.day, qty: Number(f.qty) || 0, hours: Number(f.hours) || 0, workers: Number(f.workers) || 0, shift: f.shift, remarks: f.remarks }),
              'Output recorded.',
            )) && setF({ ...f, qty: '', hours: '', workers: '', remarks: '' })
          }
        >
          Save report
        </Button>
      </div>
    </div>
  );
}

function InspectPanel({ d }: { d: WoDetail }) {
  const { busy, run } = useRun();
  const waiting = [
    ...d.ops.filter((o) => o.status === 'awaiting_qc').map((o) => ({ key: o.id, label: o.name, operationId: o.id as string | undefined, list: d.trade.checklist })),
    ...(d.wo.status === 'final_qc' ? [{ key: 'final', label: 'Final inspection', operationId: undefined, list: d.trade.finalChecklist }] : []),
  ];
  const [pick, setPick] = useState(waiting[0]?.key ?? '');
  const cur = waiting.find((x) => x.key === pick) ?? waiting[0];
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [remarks, setRemarks] = useState('');
  const [ncr, setNcr] = useState({ description: '', action: '' });
  if (!cur) return null;
  const items = cur.list.map((item) => ({ item, ok: checks[`${cur.key}:${item}`] ?? true }));
  const fail = items.some((c) => !c.ok);
  return (
    <div className="o-panel" style={{ borderColor: 'var(--steel)' }}>
      <div className="o-panel-head">
        <h2>QC inspection</h2>
        {waiting.length > 1 && (
          <select className="o-select" style={{ maxWidth: 240 }} value={cur.key} onChange={(e) => setPick(e.target.value)} aria-label="What to inspect">
            {waiting.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '-6px 0 10px' }}>
        {cur.label}: untick anything that does not meet the requirement.
      </p>
      <div className="o-stack" style={{ gap: 6 }}>
        {items.map((c) => (
          <label key={c.item} className="o-row" style={{ gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={c.ok} onChange={(e) => setChecks({ ...checks, [`${cur.key}:${c.item}`]: e.target.checked })} />
            <span className={c.ok ? '' : 'bad'}>{c.item}</span>
          </label>
        ))}
      </div>
      <label className="o-field" style={{ marginTop: 10 }}>
        Remarks / readings
        <input className="o-input" value={remarks} maxLength={2000} onChange={(e) => setRemarks(e.target.value)} />
      </label>
      {fail && (
        <div className="o-stack" style={{ gap: 8, marginTop: 10, padding: 10, border: '1px solid var(--bad)', borderRadius: 6 }}>
          <strong className="bad" style={{ fontSize: 13 }}>Non-conformance report (NCR)</strong>
          <label className="o-field">
            What is wrong
            <textarea className="o-textarea" value={ncr.description} maxLength={2000} onChange={(e) => setNcr({ ...ncr, description: e.target.value })} />
          </label>
          <label className="o-field">
            Action required
            <input className="o-input" value={ncr.action} maxLength={1000} placeholder="e.g. Grind and re-weld joint J4, re-check DFT" onChange={(e) => setNcr({ ...ncr, action: e.target.value })} />
          </label>
        </div>
      )}
      <div className="o-row" style={{ marginTop: 10 }}>
        <Button
          variant={fail ? 'danger' : 'ok'}
          disabled={busy || (fail && ncr.description.trim().length < 5)}
          onClick={async () => {
            const ok = await run(
              () => inspectAction({ workOrderId: d.wo.id, operationId: cur.operationId, checklist: items, remarks, ncr: fail ? ncr : undefined }),
              fail ? 'Failed: NCR raised and sent back for rework.' : 'Passed.',
            );
            if (ok) {
              setChecks({});
              setRemarks('');
              setNcr({ description: '', action: '' });
            }
          }}
        >
          {fail ? 'Fail and raise NCR' : 'Pass'}
        </Button>
      </div>
    </div>
  );
}

function MaterialsPanel({ d }: { d: WoDetail }) {
  const { busy, run } = useRun();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  if (!d.materials.length) return null;
  const lines = d.materials.map((m) => ({ materialId: m.id, qty: Number(qty[m.id]) || 0 })).filter((l) => l.qty !== 0);
  return (
    <div className="o-panel flush">
      <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
        <h2>Materials</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          {d.materials.filter((m) => m.issuedQty >= m.qty - 1e-9).length} of {d.materials.length} fully issued
        </span>
      </div>
      <table className="o-table">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Planned</th>
            <th className="num">Issued</th>
            <th>Status</th>
            {d.can.issue && <th className="num">Issue now</th>}
          </tr>
        </thead>
        <tbody>
          {d.materials.map((m) => (
            <tr key={m.id}>
              <td>{m.item}</td>
              <td className="num">
                {fmtQty(m.qty)} {m.unit}
              </td>
              <td className="num">{fmtQty(m.issuedQty)}</td>
              <td>{m.issuedQty >= m.qty - 1e-9 ? <Chip tone="ok">Issued</Chip> : m.issuedQty > 0 ? <Chip tone="warn">Part issued</Chip> : <Chip tone="grey">To issue</Chip>}</td>
              {d.can.issue && (
                <td className="num" style={{ width: 120 }}>
                  <input className="o-input" type="number" step="any" value={qty[m.id] ?? ''} placeholder={String(Math.max(0, m.qty - m.issuedQty))} onChange={(e) => setQty({ ...qty, [m.id]: e.target.value })} aria-label={`Issue ${m.item}`} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {d.can.issue && (
        <div className="o-row" style={{ padding: 12, borderTop: '1px solid var(--line)', alignItems: 'flex-end' }}>
          <label className="o-field" style={{ flex: 1 }}>
            Issue note (slip number, heat number…) · a negative quantity is a return
            <input className="o-input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </label>
          <Button
            size="small"
            onClick={() => setQty(Object.fromEntries(d.materials.map((m) => [m.id, String(Math.max(0, Math.round((m.qty - m.issuedQty) * 1000) / 1000))])))}
          >
            Fill balance
          </Button>
          <Button variant="primary" disabled={busy || !lines.length} onClick={async () => (await run(() => issueMaterialsAction({ workOrderId: d.wo.id, lines, note }), 'Material issued.')) && (setQty({}), setNote(''))}>
            Issue
          </Button>
        </div>
      )}
    </div>
  );
}

function NcrPanel({ d }: { d: WoDetail }) {
  const { busy, run } = useRun();
  const [close, setClose] = useState<{ id: string; text: string } | null>(null);
  return (
    <div className="o-panel flush">
      <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
        <h2>Non-conformance reports</h2>
      </div>
      <table className="o-table">
        <tbody>
          {d.ncrs.map((n) => (
            <tr key={n.id}>
              <td>
                <strong>{n.number}</strong> {n.operation}
                <div style={{ fontSize: 12 }}>{n.description}</div>
                {n.action && <div className="faint" style={{ fontSize: 11 }}>Action: {n.action}</div>}
              </td>
              <td>{n.status === 'open' ? <Chip tone="bad">Open</Chip> : <Chip tone="ok">Closed</Chip>}</td>
              <td>
                {n.status === 'open' && d.can.closeNcr && (
                  <Button size="small" onClick={() => setClose({ id: n.id, text: '' })}>
                    Close
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {close && (
        <div className="o-row" style={{ padding: 12, borderTop: '1px solid var(--line)', alignItems: 'flex-end' }}>
          <label className="o-field" style={{ flex: 1 }}>
            How was it resolved?
            <input className="o-input" value={close.text} maxLength={1000} placeholder="e.g. Accepted by customer as is (concession)" onChange={(e) => setClose({ ...close, text: e.target.value })} />
          </label>
          <Button variant="primary" disabled={busy} onClick={async () => (await run(() => closeNcrAction({ id: close.id, action: close.text }), 'NCR closed.')) && setClose(null)}>
            Close NCR
          </Button>
          <Button onClick={() => setClose(null)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

function NextStep({ d }: { d: WoDetail }) {
  const { busy, run } = useRun();
  const w = d.wo;
  const c = d.can;
  const [note, setNote] = useState('');
  const [ref, setRef] = useState('');
  const [reason, setReason] = useState('');
  const finalRework = w.status === 'in_progress' && d.ops.length > 0 && d.ops.every((o) => o.status === 'done');
  const waitingFor: Record<string, string> = {
    draft: 'The production engineer is planning it.',
    pending_release: 'Waiting for the production manager to release it.',
    released: 'Released. The store issues materials; the supervisor reports output.',
    in_progress: finalRework ? 'Final inspection failed. The floor is correcting it.' : 'In production on the shop floor.',
    final_qc: 'All operations done. Waiting for the final QC inspection.',
    completed: 'QC passed. Waiting for the store to dispatch.',
    dispatched: `Dispatched${w.dispatchedAt ? ` on ${fmtDate(new Date(w.dispatchedAt).toISOString())}` : ''}.`,
    cancelled: 'Cancelled.',
  };
  return (
    <div className="o-panel">
      <h2>Next step</h2>
      <div className="o-stack" style={{ gap: 8 }}>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          {waitingFor[w.status]}
        </p>
        {c.submit && (
          <Button variant="primary" disabled={busy} onClick={() => run(() => submitForReleaseAction({ id: w.id }), d.cfg.requireRelease ? 'Sent for release.' : 'Released.')}>
            {d.cfg.requireRelease ? 'Send for release' : 'Release to shop floor'}
          </Button>
        )}
        {c.release && (
          <>
            <label className="o-field">
              Note (required to send back)
              <textarea className="o-textarea" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="o-row">
              <Button variant="ok" disabled={busy} onClick={() => run(() => decideReleaseAction({ id: w.id, release: true, note }), 'Released to the shop floor.')}>
                Release
              </Button>
              <Button variant="danger" disabled={busy || !note.trim()} onClick={() => run(() => decideReleaseAction({ id: w.id, release: false, note }), 'Sent back to the engineer.')}>
                Send back
              </Button>
            </div>
          </>
        )}
        {finalRework && c.reworkDone && (
          <>
            <label className="o-field">
              What was corrected?
              <input className="o-input" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
            </label>
            <Button variant="primary" disabled={busy || note.trim().length < 3} onClick={() => run(() => finalReworkDoneAction({ workOrderId: w.id, remarks: note }), 'Sent for final QC.')}>
              Send for final QC again
            </Button>
          </>
        )}
        {c.dispatch && (
          <>
            <label className="o-field">
              Delivery note / vehicle number
              <input className="o-input" value={ref} maxLength={200} placeholder="DC-1042, KL-07-AB-1234" onChange={(e) => setRef(e.target.value)} />
            </label>
            <Button variant="primary" disabled={busy || ref.trim().length < 2} onClick={() => run(() => dispatchAction({ workOrderId: w.id, reference: ref }), 'Dispatched.')}>
              Dispatch
            </Button>
          </>
        )}
        {c.cancel && (
          <details>
            <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
              Cancel work order
            </summary>
            <div className="o-row" style={{ marginTop: 6 }}>
              <input className="o-input" value={reason} maxLength={500} placeholder="Reason" onChange={(e) => setReason(e.target.value)} />
              <Button variant="danger" size="small" disabled={busy || reason.trim().length < 3} onClick={() => confirm('Cancel this work order?') && run(() => cancelWorkOrderAction({ id: w.id, reason }), 'Cancelled.')}>
                Cancel
              </Button>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
