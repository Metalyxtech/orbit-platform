'use client';
import { useCallback, useEffect, useState } from 'react';
import { addProcessCommentAction, setHoldAction } from '@orbit/core/holds-actions';
import { Button, Chip, HoldBanner, ProcessControl, TopBar } from '@orbit/ui';
import { fmtDate, fmtMoney, quoteTotals, LOST_REASONS, OPEN_STAGES, SOURCES, STAGES, stageLabel, type Stage } from '../config';
import {
  askApprovalAction,
  decideQuoteAction,
  markLostAction,
  markWonAction,
  reopenProjectAction,
  sendQuoteAction,
  sendToCostingAction,
  setDiscountAction,
  setFollowUpAction,
  toNegotiationAction,
  updateProjectAction,
} from '../actions';
import type { EnquiryDetail } from '../server';
import { CostingSheet } from './CostingSheet';
import { DocsPanel } from './DocsPanel';
import { LinesEditor, type LineView } from './LinesEditor';
import { QuoteChip, StageChip } from './ui';
import { useRun } from './useRun';

/** One enquiry: project, documents, lines, totals, approval, the next action and history. */
export function EnquiryView({ d }: { d: EnquiryDetail }) {
  const e = d.enquiry;
  const cur = d.cfg.currency;
  const stage = e.stage as Stage;
  const flow = STAGES.filter((s) => s.id !== 'lost');
  const at = flow.findIndex((s) => s.id === stage);
  const linesKey = JSON.stringify(d.lines.map((l) => [l.item, l.qty, l.unit, l.rate, l.cost]));
  // What sales has on screen but not saved yet: shown live in Totals and sent with the approval.
  const [draftLines, setDraftLines] = useState<LineView[] | null>(null);
  const [draftDisc, setDraftDisc] = useState<number | null>(null);
  // A saved change (yours, or the manager's during approval) replaces whatever was typed before.
  useEffect(() => setDraftDisc(null), [e.discount, e.quoteStatus, e.rev]);
  const onDraft = useCallback((l: LineView[] | null) => setDraftLines(l), []);
  const draft: Draft = { lines: draftLines, discount: draftDisc !== null && draftDisc !== e.discount ? draftDisc : null };
  return (
    <>
      <TopBar crumbs={['Sales', 'Enquiries', e.number]} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <div className="o-row" style={{ flexWrap: 'wrap' }}>
              <h1>
                {e.number} {e.title}
              </h1>
              <StageChip stage={stage} label={stageLabel(stage)} />
              {e.quoteNo && <QuoteChip status={e.quoteStatus as never} />}
              {e.pricingDoneAt ? <Chip tone="ok">Pricing done</Chip> : <Chip tone="grey">Project open for changes</Chip>}
            </div>
            <p>
              {d.customer.name} · owner {e.owner || '-'} · created {fmtDate(e.createdAt.toISOString())}
              {e.quoteNo ? ` · ${e.quoteNo} Rev ${e.rev}` : ''}
              {d.order ? ` · order ${d.order.number}` : ''}
            </p>
          </div>
        </div>

        <ol className="p-track" aria-label="Stages">
          {flow.map((s, i) => (
            <li key={s.id} className={stage === 'lost' ? '' : i < at || stage === 'won' ? 'done' : i === at ? 'now' : ''}>
              {s.label}
            </li>
          ))}
          {stage === 'lost' && <li className="bad">Lost: {e.lostReason}</li>}
        </ol>

        {/* Estimator and management: the costing sheet, full width. Sales sees the quotation lines below. */}
        {d.can.seeCost && (e.stage === 'costing' || !!e.pricingDoneAt) && (
          <CostingSheet
            key={`${linesKey}|${e.markup}|${e.costingNotes ?? ''}`}
            enquiryId={e.id}
            lines={d.lines.map((l) => ({ item: l.item, qty: l.qty, unit: l.unit, material: l.material, labour: l.labour, other: l.other, rate: l.rate }))}
            markup={e.markup}
            notes={e.costingNotes ?? ''}
            currency={cur}
            editable={d.can.editCost}
            canFinish={d.can.pricingDone}
            priced={!!e.pricingDoneAt}
          />
        )}

        {e.returnedTo && <SentBack d={d} />}

        <HoldBanner thread={d.control} />
        <div className="o-cols-wide">
          <div className="o-stack">
            <ProjectPanel d={d} />
            <DocsPanel
              enquiryId={e.id}
              docs={d.docs}
              canEdit={d.can.editDocs}
              lockedReason={e.pricingDoneAt ? 'Pricing is done, so documents are locked. The sales manager can reopen the project for changes.' : undefined}
            />
            {(d.can.editCost || d.costingDocs.length > 0) && (
              <DocsPanel
                section="costing"
                title="Costing attachments"
                intro="Costing sheets, supplier quotes, site photos. Seen by the estimator, sales manager and GM only."
                enquiryId={e.id}
                docs={d.costingDocs}
                canEdit={d.can.editCost}
                lockedReason={e.pricingDoneAt ? 'Locked after pricing.' : undefined}
              />
            )}
            {!d.can.editCost && (
              <LinesEditor
                key={linesKey}
                enquiryId={e.id}
                lines={d.lines}
                currency={cur}
                canEdit={d.can.editLines}
                ratesOnly={d.can.editRatesOnly}
                editCost={false}
                seeCost={false}
                editRate={d.can.editLines}
                onDraft={onDraft}
              />
            )}
            {!d.can.seeCost && e.costingNotes && (
              <div className="o-panel">
                <h2>Costing basis from the estimator</h2>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 13 }}>{e.costingNotes}</p>
              </div>
            )}
            {e.quoteNo && <QuotePreview d={d} />}
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
            {!d.can.editCost && <TotalsPanel key={e.discount} d={d} draft={draft} setDraftDisc={setDraftDisc} />}
            <ActionsPanel d={d} draft={draft} />
            <ProcessControl thread={d.control} setHold={setHoldAction} comment={addProcessCommentAction} />
            {d.can.followUp && <FollowUpPanel d={d} />}
            <div className="o-panel">
              <h2>Customer</h2>
              <div className="p-dl" style={{ fontSize: 13 }}>
                <div><span>Name</span><strong>{d.customer.name}</strong></div>
                <div><span>City</span><strong>{d.customer.city || '-'}</strong></div>
                <div><span>Contact</span><strong>{d.customer.contact || '-'}</strong></div>
                <div><span>Phone</span><strong>{d.customer.phone || '-'}</strong></div>
                <div><span>Email</span><strong>{d.customer.email || '-'}</strong></div>
                <div><span>GSTIN</span><strong>{d.customer.gstin || '-'}</strong></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ProjectPanel({ d }: { d: EnquiryDetail }) {
  const e = d.enquiry;
  const { busy, run } = useRun();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: e.title, details: e.details ?? '', source: e.source ?? 'Phone', probability: e.probability, followUp: e.followUp });
  if (!edit)
    return (
      <div className="o-panel">
        <div className="o-panel-head">
          <h2>Project</h2>
          {d.can.editProject && (
            <Button size="small" onClick={() => setEdit(true)}>
              Edit project
            </Button>
          )}
        </div>
        <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 10px', fontSize: 13 }}>{e.details || <span className="faint">No details yet.</span>}</p>
        <div className="muted" style={{ fontSize: 12 }}>
          Source {e.source || '-'} · chance {e.probability}% · follow-up {fmtDate(e.followUp)}
        </div>
        {!d.can.editProject && OPEN_STAGES.includes(e.stage as Stage) && e.pricingDoneAt && (
          <p className="faint" style={{ fontSize: 11, margin: '8px 0 0' }}>
            Locked after pricing on {fmtDate(new Date(e.pricingDoneAt).toISOString())}.
          </p>
        )}
      </div>
    );
  return (
    <div className="o-panel">
      <h2>Edit project</h2>
      <div className="o-stack" style={{ gap: 10 }}>
        <label className="o-field">
          Requirement
          <input className="o-input" value={f.title} maxLength={200} onChange={(x) => setF({ ...f, title: x.target.value })} />
        </label>
        <label className="o-field">
          Details for the estimator (scope, specs, site, delivery)
          <textarea className="o-textarea" rows={6} value={f.details} maxLength={8000} onChange={(x) => setF({ ...f, details: x.target.value })} />
        </label>
        <div className="o-form-row">
          <label className="o-field">
            Source
            <select className="o-select" value={f.source} onChange={(x) => setF({ ...f, source: x.target.value })}>
              {SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="o-field">
            Chance of winning %
            <input className="o-input" type="number" min={0} max={100} value={f.probability} onChange={(x) => setF({ ...f, probability: Math.max(0, Math.min(100, Number(x.target.value) || 0)) })} />
          </label>
          <label className="o-field">
            Follow-up
            <input className="o-input" type="date" value={f.followUp ?? ''} onChange={(x) => setF({ ...f, followUp: x.target.value || null })} />
          </label>
        </div>
        <div className="o-row">
          <Button variant="primary" disabled={busy} onClick={async () => (await run(() => updateProjectAction({ id: e.id, ...f }), 'Project saved.')) && setEdit(false)}>
            Save project
          </Button>
          <Button onClick={() => setEdit(false)}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

/** Rates and discount on screen that are not saved yet. */
interface Draft {
  lines: LineView[] | null;
  discount: number | null;
}
const isDirty = (x: Draft) => !!x.lines || x.discount !== null;

function TotalsPanel({ d, draft, setDraftDisc }: { d: EnquiryDetail; draft: Draft; setDraftDisc: (v: number | null) => void }) {
  const e = d.enquiry;
  const cur = d.cfg.currency;
  const live = isDirty(draft);
  const disc = draft.discount ?? e.discount;
  const t = live ? quoteTotals(draft.lines ?? d.lines, disc, d.cfg.gst) : d.totals;
  const { busy, run } = useRun();
  const [discText, setDiscText] = useState(String(e.discount));
  return (
    <div className="o-panel" style={live ? { borderColor: 'var(--hivis, #d97706)' } : undefined}>
      <div className="o-panel-head" style={{ marginBottom: 8 }}>
        <h2>Totals</h2>
        {live && <Chip tone="hivis">Not saved</Chip>}
      </div>
      <div className="p-dl" style={{ fontSize: 13 }}>
        <div><span>Gross</span><strong>{fmtMoney(cur, t.gross)}</strong></div>
        <div><span>Discount {disc}%</span><strong>- {fmtMoney(cur, t.disc)}</strong></div>
        <div><span>Net (before GST)</span><strong>{fmtMoney(cur, t.net)}</strong></div>
        <div><span>GST {d.cfg.gst}%</span><strong>{fmtMoney(cur, t.tax)}</strong></div>
        <div><span>Total</span><strong>{fmtMoney(cur, t.total)}</strong></div>
        {live && (
          <div>
            <span>Saved value</span>
            <strong className="muted">{fmtMoney(cur, d.totals.total)}</strong>
          </div>
        )}
      {d.can.seeCost && t.cost > 0 && (
          <>
            <div><span>Cost</span><strong>{fmtMoney(cur, t.cost)}</strong></div>
            <div><span>Margin</span><strong className={t.margin < d.cfg.minMargin ? 'bad' : ''}>{t.margin.toFixed(1)}%</strong></div>
          </>
        )}
      </div>
      {d.can.discount && (
        <div className="o-row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
          <label className="o-field" style={{ flex: 1 }}>
            Discount %
            <input
              className="o-input"
              type="number"
              min={0}
              max={50}
              step="0.5"
              value={discText}
              onChange={(x) => {
                setDiscText(x.target.value);
                const n = Math.max(0, Math.min(50, Number(x.target.value) || 0));
                setDraftDisc(n === e.discount ? null : n);
              }}
            />
          </label>
          <Button size="small" disabled={busy || draft.discount === null} onClick={() => run(() => setDiscountAction({ id: e.id, discount: draft.discount ?? e.discount }), 'Discount saved.')}>
            Save
          </Button>
        </div>
      )}
      {e.pricingDoneAt && <ApprovalChain status={e.quoteStatus} gm={d.gm} />}
    </div>
  );
}

const RETURN_ROLE: Record<string, string> = { exec: 'sales executive', estimator: 'estimator', manager: 'sales manager' };

/** Banner while a quotation is back with someone: who sent it, to whom, why, and what happens next. */
function SentBack({ d }: { d: EnquiryDetail }) {
  const e = d.enquiry;
  const to = e.returnedTo ?? 'exec';
  const mine = (to === 'exec' && d.can.askApproval) || (to === 'estimator' && d.can.editCost) || (to === 'manager' && d.can.approve === 'manager');
  const next = to === 'estimator' ? 'Update the costing sheet, then press Pricing done.' : to === 'manager' ? 'Review it again, then approve or send it back.' : 'Change the rates, discount or terms, then send for approval again.';
  return (
    <div className="o-panel" style={{ borderLeft: '4px solid var(--hivis, #d97706)', background: mine ? 'var(--hivis-tint, #fff7e6)' : undefined }}>
      <div className="o-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <strong>
          {mine ? 'Sent back to you' : `Sent back to the ${RETURN_ROLE[to]}`} by the {e.returnedBy === 'GM' ? 'GM' : 'sales manager'}
        </strong>
        <Chip tone="hivis">Approval starts again after the change</Chip>
      </div>
      <p style={{ margin: '8px 0 4px', fontSize: 14, whiteSpace: 'pre-wrap' }}>“{e.returnedNote}”</p>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>{mine ? next : `Waiting for the ${RETURN_ROLE[to]}.`}</p>
    </div>
  );
}

/** Approval route for the quotation: sales manager, then (when needed) the GM's final approval. */
function ApprovalChain({ status, gm }: { status: string; gm: boolean }) {
  const steps = [
    { label: 'Sales manager', state: status === 'pending' ? 'now' : ['pending_gm', 'approved', 'sent'].includes(status) ? 'done' : status === 'rejected' ? 'bad' : 'todo' },
    ...(gm ? [{ label: 'GM (final)', state: status === 'pending_gm' ? 'now' : ['approved', 'sent'].includes(status) ? 'done' : 'todo' }] : []),
  ];
  const mark = (x: string) => (x === 'done' ? '✓' : x === 'now' ? '●' : x === 'bad' ? '✕' : '○');
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--line-2)', paddingTop: 10 }}>
      <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
        Approval before sending
      </div>
      {steps.map((x, i) => (
        <div key={x.label} className="o-row" style={{ fontSize: 13, gap: 8, marginBottom: 4 }}>
          <span className={x.state === 'done' ? 'ok' : x.state === 'bad' ? 'bad' : x.state === 'now' ? 'hivis' : 'faint'} style={{ width: 14, textAlign: 'center' }}>
            {mark(x.state)}
          </span>
          <span>
            {i + 1}. {x.label}
          </span>
          {x.state === 'now' && <Chip tone="hivis">Waiting</Chip>}
          {x.state === 'bad' && <Chip tone="bad">Sent back</Chip>}
        </div>
      ))}
    </div>
  );
}

function ActionsPanel({ d, draft }: { d: EnquiryDetail; draft: Draft }) {
  const e = d.enquiry;
  const c = d.can;
  const dirty = isDirty(draft);
  // Changed rates or discount always go through approval again, even on an approved or sent quotation.
  const canAsk = c.askApproval || (dirty && c.editLines && !!e.pricingDoneAt);
  const { busy, run } = useRun();
  const [note, setNote] = useState('');
  const [newDisc, setNewDisc] = useState(String(e.discount));
  const [sendTo, setSendTo] = useState<'exec' | 'estimator' | 'manager'>('exec');
  const [reason, setReason] = useState(LOST_REASONS[0]);
  const [advance, setAdvance] = useState(String(d.cfg.defaultAdvance));
  const any = c.sendToCosting || c.reopen || canAsk || c.approve || c.send || c.negotiate || c.won || c.lost;
  if (!any)
    return (
      <div className="o-panel">
        <h2>Next step</h2>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          {c.pricingDone ? 'Fill in the costing sheet, save it, then press Pricing done.' : e.stage === 'costing' ? 'With the estimator for costing.' : e.quoteStatus === 'pending' || e.quoteStatus === 'pending_gm' ? 'Waiting for the sales manager to approve.' : OPEN_STAGES.includes(e.stage as Stage) ? 'Nothing for you here right now.' : `This enquiry is ${stageLabel(e.stage).toLowerCase()}.`}
        </p>
      </div>
    );
  return (
    <div className="o-panel">
      <h2>Next step</h2>
      <div className="o-stack" style={{ gap: 8 }}>
        {c.sendToCosting && (
          <>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>Add the project details and documents, then hand it to the estimator. You can still edit until pricing is done.</p>
            <Button variant="primary" disabled={busy} onClick={() => run(() => sendToCostingAction({ id: e.id }), 'Sent for costing.')}>Send to estimator</Button>
          </>
        )}
        {c.approve && (
          <>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              {c.approve === 'manager'
                ? d.gm
                  ? 'Step 1 of 2: review the rates and discount. After you approve, it goes to the GM for final approval.'
                  : 'Review the rates and discount, then approve.'
                : 'Final approval: the sales manager has approved this quotation.'}
            </p>
            {c.approve === 'manager' && (
              <label className="o-field">
                Discount % (you can change it)
                <input className="o-input" type="number" min={0} max={50} step="0.5" value={newDisc} onChange={(x) => setNewDisc(x.target.value)} />
              </label>
            )}
            <label className="o-field">
              Comment {c.approve === 'manager' ? '(goes in the history)' : ''}
              <textarea className="o-textarea" value={note} maxLength={1000} placeholder="Required to send back" onChange={(x) => setNote(x.target.value)} />
            </label>
            <div className="o-row">
              <Button
                variant="ok"
                disabled={busy}
                onClick={() =>
                  run(
                    () => decideQuoteAction({ id: e.id, approve: true, note, ...(c.approve === 'manager' ? { discount: Math.max(0, Math.min(50, Number(newDisc) || 0)) } : {}) }),
                    c.approve === 'manager' && d.gm ? 'Approved. Sent to the GM for final approval.' : 'Approved.',
                  )
                }
              >
                {c.approve === 'gm' ? 'Give final approval' : 'Approve'}
              </Button>
            </div>
            <div className="o-stack" style={{ gap: 6, borderTop: '1px solid var(--line-2)', paddingTop: 10 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Not right? Send it back to the person who should change it. They get a task, and approval starts again after their change.
              </span>
              <label className="o-field">
                Send back to
                <select className="o-select" value={sendTo} onChange={(x) => setSendTo(x.target.value as typeof sendTo)}>
                  <option value="exec">Sales executive: rates, discount or terms</option>
                  <option value="estimator">Estimator: costing or scope</option>
                  {c.approve === 'gm' && <option value="manager">Sales manager: review again</option>}
                </select>
              </label>
              <Button
                variant="danger"
                disabled={busy || !note.trim()}
                title={!note.trim() ? 'Add a comment first' : undefined}
                onClick={() => run(() => decideQuoteAction({ id: e.id, approve: false, note, sendTo }), `Sent back to the ${sendTo === 'exec' ? 'sales executive' : sendTo === 'estimator' ? 'estimator' : 'sales manager'}.`)}
              >
                Send back
              </Button>
            </div>
          </>
        )}
        {canAsk && (
          <>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              {dirty ? 'Your new rates and discount are saved and sent together' : 'Check the rates and discount, then send for approval'}: sales manager{d.gm ? ', then the GM' : ''}.
            </p>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                run(
                  () => askApprovalAction({ id: e.id, rates: draft.lines?.map((l) => l.rate), discount: draft.discount ?? undefined }),
                  dirty ? 'Changes saved and sent to the sales manager for approval.' : 'Sent to the sales manager for approval.',
                )
              }
            >
              {dirty ? 'Save and send for approval' : 'Send for approval'}
            </Button>
          </>
        )}
        {c.send && !dirty && e.quoteStatus === 'approved' && (
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            {d.sentBefore ? `Approved. Send the revised quotation to ${d.customer.name}; it goes out as Rev ${e.rev + 1}.` : `Approved. Send the quotation to ${d.customer.name}.`}
          </p>
        )}
        {c.send && !dirty && (
          <Button variant="primary" disabled={busy} onClick={() => run(() => sendQuoteAction({ id: e.id }), d.sentBefore ? `Revised quotation Rev ${e.rev + 1} sent.` : 'Quotation sent.')}>
            {e.quoteStatus === 'approved' && d.sentBefore
              ? `Send revised quotation (Rev ${e.rev + 1})`
              : e.quoteStatus === 'approved'
                ? 'Send quotation to customer'
                : `Send again as Rev ${e.rev + 1}`}
          </Button>
        )}
        {c.negotiate && <Button disabled={busy} onClick={() => run(() => toNegotiationAction({ id: e.id }), 'Moved to negotiation.')}>Customer is negotiating</Button>}
        {c.won && (
          <div className="o-row" style={{ alignItems: 'flex-end' }}>
            <label className="o-field" style={{ width: 110 }}>
              Advance %
              <input className="o-input" type="number" min={0} max={100} value={advance} onChange={(x) => setAdvance(x.target.value)} />
            </label>
            <Button variant="ok" disabled={busy} onClick={() => run(() => markWonAction({ id: e.id, advancePct: Number(advance) || 0 }), 'Won. Sales order created.')}>Mark won</Button>
          </div>
        )}
        {c.reopen && <Button disabled={busy} onClick={() => confirm('Reopen the project for changes? It goes back to costing and needs pricing again.') && run(() => reopenProjectAction({ id: e.id }), 'Reopened.')}>Reopen for changes</Button>}
        {c.lost && (
          <details>
            <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>Mark lost</summary>
            <div className="o-row" style={{ marginTop: 6 }}>
              <select className="o-select" value={reason} onChange={(x) => setReason(x.target.value)} aria-label="Reason">
                {LOST_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <Button variant="danger" size="small" disabled={busy} onClick={() => run(() => markLostAction({ id: e.id, reason }), 'Marked lost.')}>Lost</Button>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function FollowUpPanel({ d }: { d: EnquiryDetail }) {
  const e = d.enquiry;
  const { busy, run } = useRun();
  const [date, setDate] = useState(e.followUp ?? '');
  const [prob, setProb] = useState(String(e.probability));
  const [note, setNote] = useState('');
  const [newDisc, setNewDisc] = useState(String(e.discount));
  const [sendTo, setSendTo] = useState<'exec' | 'estimator' | 'manager'>('exec');
  return (
    <div className="o-panel">
      <h2>Follow-up</h2>
      <div className="o-stack" style={{ gap: 8 }}>
        <div className="o-row">
          <input className="o-input" type="date" value={date} onChange={(x) => setDate(x.target.value)} aria-label="Next follow-up" />
          <input className="o-input" type="number" min={0} max={100} value={prob} onChange={(x) => setProb(x.target.value)} aria-label="Chance %" style={{ width: 80 }} />
        </div>
        <input className="o-input" value={note} maxLength={500} placeholder="What happened (call, visit, email)" onChange={(x) => setNote(x.target.value)} />
        <Button size="small" disabled={busy} onClick={async () => (await run(() => setFollowUpAction({ id: e.id, followUp: date || null, probability: Math.max(0, Math.min(100, Number(prob) || 0)), note }), 'Follow-up saved.')) && setNote('')}>
          Save follow-up
        </Button>
      </div>
    </div>
  );
}

/** What the customer receives (print with the browser). */
function QuotePreview({ d }: { d: EnquiryDetail }) {
  const e = d.enquiry;
  const cur = d.cfg.currency;
  const t = d.totals;
  return (
    <details className="o-panel">
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Quotation preview ({e.quoteNo} Rev {e.rev})</summary>
      <div style={{ marginTop: 12, fontSize: 13 }}>
        <p style={{ margin: '0 0 8px' }}>
          To <strong>{d.customer.name}</strong>
          {d.customer.city ? `, ${d.customer.city}` : ''}
          {d.customer.gstin ? ` · GSTIN ${d.customer.gstin}` : ''}
          <br />
          Subject: {e.title} · valid {d.cfg.validityDays} days
        </p>
        <table className="o-table">
          <thead>
            <tr><th>#</th><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={l.id}>
                <td>{i + 1}</td>
                <td>{l.item}</td>
                <td className="num">{l.qty.toLocaleString('en-IN')} {l.unit}</td>
                <td className="num">{fmtMoney(cur, l.rate)}</td>
                <td className="num">{fmtMoney(cur, l.qty * l.rate)}</td>
              </tr>
            ))}
            {e.discount > 0 && <tr><td /><td colSpan={3}>Discount {e.discount}%</td><td className="num">- {fmtMoney(cur, t.disc)}</td></tr>}
            <tr><td /><td colSpan={3}>GST {d.cfg.gst}%</td><td className="num">{fmtMoney(cur, t.tax)}</td></tr>
            <tr><td /><td colSpan={3}><strong>Total</strong></td><td className="num"><strong>{fmtMoney(cur, t.total)}</strong></td></tr>
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{d.cfg.terms}</p>
      </div>
    </details>
  );
}
