'use client';
import { useState } from 'react';
import { Button, Chip, TopBar } from '@orbit/ui';
import { fmtDateTime, SOURCE_PORTAL, SOURCES, type Finding } from '../config';
import { decideAction, submitReportAction } from '../actions';
import type { QcDetail } from '../server';
import { ResultChip, SourceTag, StatusChip } from './ui';
import { useRun } from './useRun';

/** One inspection: what to check and its files; the engineer's report; the manager's final approval; the printable report. */
export function InspectionView({ d }: { d: QcDetail }) {
  const i = d.insp;
  return (
    <>
      <TopBar crumbs={['Quality', 'Inspections', i.number]} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <div className="o-row" style={{ flexWrap: 'wrap' }}>
              <h1>
                {i.number} {i.title}
              </h1>
              <SourceTag source={i.source} />
              <StatusChip status={i.status} />
              <ResultChip result={i.status === 'pending' ? null : (i.result as 'pass' | 'fail' | null)} />
            </div>
            <p>
              {SOURCES[i.source]} · {i.sourceRef}
              {i.party ? ` · ${i.party}` : ''} · raised {fmtDateTime(i.createdAt)}
              {i.requestedByName ? ` by ${i.requestedByName}` : ''}
              {i.round > 1 ? ` · re-inspection round ${i.round}` : ''}
            </p>
          </div>
          {i.status === 'approved' && (
            <button className="o-btn" type="button" onClick={() => window.print()}>
              Print report
            </button>
          )}
        </div>

        <ol className="p-track" aria-label="Stages">
          <li className={i.status === 'pending' ? 'now' : 'done'}>QC engineer inspects</li>
          <li className={i.status === 'submitted' ? 'now' : i.status === 'approved' ? 'done' : ''}>QC manager approves</li>
          <li className={i.status === 'approved' ? 'done' : ''}>Final report to {SOURCE_PORTAL[i.source]}</li>
        </ol>

        {i.status === 'pending' && i.returnNote && (
          <div className="o-panel" style={{ borderLeft: '4px solid var(--hivis, #d97706)' }}>
            <strong>Sent back by the QC manager</strong>
            <p style={{ margin: '6px 0 0' }}>“{i.returnNote}”</p>
          </div>
        )}

        <div className="o-cols-wide">
          <div className="o-stack">
            <div className="o-panel">
              <h2>What to inspect</h2>
              <div className="p-dl" style={{ fontSize: 13 }}>
                {i.details.map((x) => (
                  <div key={x.label}>
                    <span>{x.label}</span>
                    <strong>{x.value}</strong>
                  </div>
                ))}
              </div>
              {i.items.length > 0 && (
                <table className="o-table" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="num">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {i.items.map((x, n) => (
                      <tr key={n}>
                        <td>{x.item}</td>
                        <td className="num">
                          {Number(x.qty).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {x.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="o-panel" style={{ borderLeft: '4px solid var(--steel)' }}>
              <h2>Documents and drawings</h2>
              {i.documents.length === 0 ? (
                <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                  No files were attached by {SOURCE_PORTAL[i.source]} yet.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {i.documents.map((x, n) => (
                    <li key={n} style={{ fontSize: 13 }}>
                      <a href={x.url} target="_blank" rel="noopener noreferrer">
                        {x.name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {d.can.inspect ? <ReportForm d={d} /> : i.status !== 'pending' && <Report d={d} />}
            <div className="o-panel">
              <h2>History</h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {d.events.map((x) => (
                  <li key={x.id} style={{ fontSize: 13 }}>
                    {x.text}
                    <div className="faint" style={{ fontSize: 11 }}>
                      {x.by || 'Orbit'} · {fmtDateTime(x.at)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="o-stack">
            {d.can.approve ? <ApprovePanel d={d} /> : <NextStep d={d} />}
            {d.rounds.length > 1 && (
              <div className="o-panel">
                <h2>Inspection rounds</h2>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  {d.rounds.map((r) => (
                    <li key={r.id} className="o-row" style={{ gap: 6 }}>
                      <a href={`/quality/inspection?id=${r.id}`}>
                        {r.number} · round {r.round}
                      </a>
                      {r.status === 'approved' ? <ResultChip result={r.result as 'pass' | 'fail'} /> : <Chip tone="hivis">Open</Chip>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function NextStep({ d }: { d: QcDetail }) {
  const i = d.insp;
  const text: Record<string, string> = {
    pending: 'Waiting for the QC engineer to inspect.',
    submitted: 'Inspected. Waiting for the QC manager’s final approval.',
    approved: `Final. ${SOURCE_PORTAL[i.source]} has the result.`,
    cancelled: 'Cancelled.',
  };
  return (
    <div className="o-panel">
      <h2>Next step</h2>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        {text[i.status]}
      </p>
    </div>
  );
}

/** The QC engineer's report: checklist pass / fail with notes, extra checks, readings, NCR. */
function ReportForm({ d }: { d: QcDetail }) {
  const { busy, run } = useRun();
  const i = d.insp;
  const [rows, setRows] = useState<Finding[]>(i.findings.length ? i.findings.filter((f) => i.checklist.includes(f.item)) : i.checklist.map((item) => ({ item, ok: true, note: '' })));
  const [extra, setExtra] = useState<Finding[]>(i.findings.filter((f) => !i.checklist.includes(f.item)));
  const [remarks, setRemarks] = useState(i.remarks ?? '');
  const [ncr, setNcr] = useState(i.ncr ?? '');
  const all = [...rows, ...extra.filter((e) => e.item.trim())];
  const fail = all.some((f) => !f.ok);
  const set = (n: number, patch: Partial<Finding>) => setRows(rows.map((r, k) => (k === n ? { ...r, ...patch } : r)));
  return (
    <div className="o-panel" style={{ borderColor: 'var(--steel)' }}>
      <h2>Inspection report</h2>
      <table className="o-table">
        <thead>
          <tr>
            <th>Check</th>
            <th style={{ width: 150 }}>Result</th>
            <th>Reading / note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, n) => (
            <tr key={r.item}>
              <td>{r.item}</td>
              <td>
                <div className="o-row" style={{ gap: 4 }}>
                  <Button size="small" variant={r.ok ? 'ok' : undefined} onClick={() => set(n, { ok: true })} aria-label={`${r.item}: OK`}>
                    OK
                  </Button>
                  <Button size="small" variant={!r.ok ? 'danger' : undefined} onClick={() => set(n, { ok: false })} aria-label={`${r.item}: Not OK`}>
                    Not OK
                  </Button>
                </div>
              </td>
              <td>
                <input className="o-input" value={r.note ?? ''} maxLength={500} aria-label={`${r.item} note`} onChange={(e) => set(n, { note: e.target.value })} />
              </td>
            </tr>
          ))}
          {extra.map((r, n) => (
            <tr key={`x${n}`}>
              <td>
                <input className="o-input" value={r.item} placeholder="Extra check" maxLength={300} aria-label={`Extra check ${n + 1}`} onChange={(e) => setExtra(extra.map((x, k) => (k === n ? { ...x, item: e.target.value } : x)))} />
              </td>
              <td>
                <div className="o-row" style={{ gap: 4 }}>
                  <Button size="small" variant={r.ok ? 'ok' : undefined} onClick={() => setExtra(extra.map((x, k) => (k === n ? { ...x, ok: true } : x)))}>
                    OK
                  </Button>
                  <Button size="small" variant={!r.ok ? 'danger' : undefined} onClick={() => setExtra(extra.map((x, k) => (k === n ? { ...x, ok: false } : x)))}>
                    Not OK
                  </Button>
                </div>
              </td>
              <td>
                <input className="o-input" value={r.note ?? ''} maxLength={500} onChange={(e) => setExtra(extra.map((x, k) => (k === n ? { ...x, note: e.target.value } : x)))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8 }}>
        <Button size="small" onClick={() => setExtra([...extra, { item: '', ok: true, note: '' }])}>
          Add a check
        </Button>
      </div>
      <label className="o-field" style={{ marginTop: 12 }}>
        Remarks and measurements
        <textarea className="o-textarea" rows={3} value={remarks} maxLength={4000} onChange={(e) => setRemarks(e.target.value)} />
      </label>
      {fail && (
        <label className="o-field" style={{ marginTop: 10 }}>
          <span className="bad">Non-conformance (NCR): what is wrong and what must be done</span>
          <textarea className="o-textarea" rows={3} value={ncr} maxLength={4000} placeholder="e.g. Plate thickness 9.4 mm against 10 mm ordered on 6 of 20 plates. Replace the 6 plates." onChange={(e) => setNcr(e.target.value)} />
        </label>
      )}
      <div className="o-row" style={{ marginTop: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className="o-row" style={{ gap: 6, fontSize: 13 }}>
          Result: <ResultChip result={fail ? 'fail' : 'pass'} />
        </span>
        <Button
          variant="primary"
          disabled={busy || (fail && ncr.trim().length < 5)}
          onClick={() => run(() => submitReportAction({ id: i.id, findings: rows, extra: extra.filter((e) => e.item.trim()), remarks, ncr: fail ? ncr : undefined }), 'Report sent to the QC manager.')}
        >
          Submit report to QC manager
        </Button>
      </div>
    </div>
  );
}

/** The submitted / final report (read-only, printable). */
function Report({ d }: { d: QcDetail }) {
  const i = d.insp;
  return (
    <div className="o-panel">
      <div className="o-panel-head">
        <h2>Inspection report</h2>
        <ResultChip result={i.result as 'pass' | 'fail' | null} />
      </div>
      <table className="o-table">
        <thead>
          <tr>
            <th>Check</th>
            <th>Result</th>
            <th>Reading / note</th>
          </tr>
        </thead>
        <tbody>
          {i.findings.map((f, n) => (
            <tr key={n}>
              <td>{f.item}</td>
              <td>{f.ok ? <Chip tone="ok">OK</Chip> : <Chip tone="bad">Not OK</Chip>}</td>
              <td className="muted">{f.note || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {i.remarks && (
        <p style={{ margin: '12px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>
          <strong>Remarks:</strong> {i.remarks}
        </p>
      )}
      {i.ncr && (
        <p style={{ margin: '8px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }} className="bad">
          <strong>Non-conformance:</strong> {i.ncr}
        </p>
      )}
      <div className="p-dl" style={{ fontSize: 13, marginTop: 14, borderTop: '1px solid var(--line-2)', paddingTop: 10 }}>
        <div>
          <span>Inspected by (QC engineer)</span>
          <strong>
            {i.inspector || '-'} · {fmtDateTime(i.inspectedAt)}
          </strong>
        </div>
        <div>
          <span>Final approval (QC manager)</span>
          <strong>{i.status === 'approved' ? `${i.approver} · ${fmtDateTime(i.approvedAt)}` : 'Waiting'}</strong>
        </div>
        {i.approverNote && (
          <div>
            <span>QC manager’s note</span>
            <strong>{i.approverNote}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

function ApprovePanel({ d }: { d: QcDetail }) {
  const { busy, run } = useRun();
  const [note, setNote] = useState('');
  const i = d.insp;
  return (
    <div className="o-panel" style={{ borderColor: 'var(--steel)' }}>
      <h2>Final approval</h2>
      <p className="muted" style={{ fontSize: 12, margin: '-6px 0 10px' }}>
        {i.inspector} inspected this: <strong>{i.result === 'pass' ? 'PASS' : 'FAIL'}</strong>. Approving sends the result to {SOURCE_PORTAL[i.source]}
        {i.result === 'pass' ? (i.source === 'production' ? ' and the work is ready to dispatch.' : ' and the material is accepted into stock.') : ' for the non-conformance to be corrected.'}
      </p>
      <label className="o-field">
        Note (required to send back)
        <textarea className="o-textarea" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="o-row" style={{ marginTop: 10 }}>
        <Button variant="ok" disabled={busy} onClick={() => run(() => decideAction({ id: i.id, approve: true, note }), 'Final approval given.')}>
          Approve report
        </Button>
        <Button variant="danger" disabled={busy || !note.trim()} onClick={() => run(() => decideAction({ id: i.id, approve: false, note }), 'Sent back to the QC engineer.')}>
          Send back
        </Button>
      </div>
    </div>
  );
}
