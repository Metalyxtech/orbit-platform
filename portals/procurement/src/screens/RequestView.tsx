'use client';
import { Chip, TopBar } from '@orbit/ui';
import type { RequestDetail, SupplierRow } from '../server';
import { showValue } from './FieldInput';
import { QuoteFileLinks } from './QuoteFiles';
import { ReceiptDocs } from './ReceiptDocs';
import { RECEIVED_AT } from '../config';
import { ApprovalStep } from './steps/ApprovalStep';
import { InspectStep } from './steps/InspectStep';
import { InvoiceStep } from './steps/InvoiceStep';
import { IssuePoStep } from './steps/IssuePoStep';
import { IssueStockStep } from './steps/IssueStockStep';
import { QuotesStep } from './steps/QuotesStep';
import { ReceiveStep } from './steps/ReceiveStep';
import { StockCheckStep } from './steps/StockCheckStep';
import { fmtDate, fmtMoney, fmtQty, StageChip } from './ui';

/** One request: details, lines, quotes, receipts, timeline, and the action for the current step. */
export function RequestView({ d, suppliers }: { d: RequestDetail; suppliers: SupplierRow[] }) {
  const r = d.request;
  const cur = d.cfg.money.currency;
  const at = d.flowStages.findIndex((s) => s.key === r.stage);
  const finished = r.stage === 'closed';
  return (
    <>
      <TopBar crumbs={['Purchase', 'Requests', r.number]} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <div className="o-row">
              <h1>
                {r.number} {r.title}
              </h1>
              <StageChip stage={r.stage} label={r.stageLabel} />
              {r.priority === 'Urgent' && <Chip tone="warn">Urgent</Chip>}
              {r.late && <Chip tone="bad">Past need-by</Chip>}
            </div>
            <p>
              {r.project} · raised by {r.requester} on {fmtDate(r.createdAt)} · need by {fmtDate(r.needBy)}
              {r.poNo ? ` · ${r.poNo} issued ${fmtDate(r.poDate)}` : ''}
            </p>
          </div>
        </div>

        <ol className="p-track" aria-label="Workflow">
          {d.flowStages.map((s, i) => (
            <li key={s.key} className={finished || (at >= 0 && i < at) ? 'done' : i === at ? 'now' : r.stage === 'stock_issue' && s.key === 'stock_issue' ? 'now' : ''}>
              {s.label}
            </li>
          ))}
          <li className={finished ? 'done' : r.stage === 'rejected' ? 'bad' : ''}>{r.stage === 'rejected' ? 'Rejected' : 'Closed'}</li>
        </ol>

        <div className="o-cols">
          <div className="o-stack">
            {d.origin && (
              <div className="o-panel" style={{ borderLeft: '3px solid var(--steel)' }}>
                <strong>Raised by Production</strong>
                <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
                  Material request {d.origin.ref} for work order {d.origin.workOrder}, approved by the production engineer and production manager. Match it with the main store
                  (issue from stock) or buy it; the material goes to the production store.
                </p>
              </div>
            )}
            {d.cfg.form.header.length > 0 && (
              <div className="o-panel">
                <h2>Details</h2>
                <div className="p-dl">
                  {d.cfg.form.header.map((f) => (
                    <div key={f.id}>
                      <span>{f.label}</span>
                      <strong>{showValue(r.header[f.id])}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="o-panel flush">
              <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                <h2>Items</h2>
              </div>
              <div className="o-scroll">
                <table className="o-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      {d.cfg.form.line.map((f) => (
                        <th key={f.id}>{f.label}</th>
                      ))}
                      <th className="num">Qty</th>
                      <th className="num">From stock</th>
                      <th className="num">To buy</th>
                      <th className="num">Rate</th>
                      <th className="num">Amount</th>
                      {r.poNo && <th className="num">Received</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {d.lines.map((l) => (
                      <tr key={l.id}>
                        <td>
                          {l.description}
                          {l.item && (
                            <div className="faint" style={{ fontSize: 11 }}>
                              {l.item.code} · {fmtQty(l.item.available)} {l.item.unit} available
                            </div>
                          )}
                        </td>
                        {d.cfg.form.line.map((f) => (
                          <td key={f.id}>{showValue(l.values[f.id])}</td>
                        ))}
                        <td className="num">
                          {fmtQty(l.qty)} {l.unit}
                        </td>
                        <td className="num">{l.reservedQty ? <span title={l.reserveState}>{fmtQty(l.reservedQty)} {l.reserveState === 'issued' ? '(issued)' : ''}</span> : '-'}</td>
                        <td className="num">{l.checked || l.buy !== l.qty ? fmtQty(l.buy) : fmtQty(l.qty)}</td>
                        <td className="num">{l.buy > 0 ? fmtMoney(cur, l.rate) : '-'}</td>
                        <td className="num">{l.buy > 0 ? fmtMoney(cur, l.buy * l.rate) : '-'}</td>
                        {r.poNo && <td className="num">{l.buy > 0 ? `${fmtQty(l.received)} / ${fmtQty(l.buy)}` : '-'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {d.quotes.length > 0 && (
              <div className="o-panel flush">
                <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                  <h2>Quote comparison</h2>
                </div>
                <div className="o-scroll">
                  <table className="o-table">
                    <thead>
                      <tr>
                        <th>Line</th>
                        {d.quotes.map((q) => (
                          <th key={q.id} className="num">
                            {q.supplier}
                            {r.awardQuoteId === q.id && ' (awarded)'}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {d.lines.map((l, i) => {
                        const low = Math.min(...d.quotes.map((q) => q.rates[i] || Infinity));
                        return l.buy > 0 ? (
                          <tr key={l.id}>
                            <td>{l.description}</td>
                            {d.quotes.map((q) => (
                              <td key={q.id} className={`num${q.rates[i] === low ? ' p-low' : ''}`}>
                                {fmtMoney(cur, q.rates[i])}
                              </td>
                            ))}
                          </tr>
                        ) : null;
                      })}
                      <tr>
                        <td>
                          <strong>Total</strong>
                        </td>
                        {d.quotes.map((q) => (
                          <td key={q.id} className="num">
                            <strong>{fmtMoney(cur, q.total)}</strong>
                            <div className="faint" style={{ fontSize: 11 }}>
                              {q.leadDays != null ? `${q.leadDays} d` : ''} {q.terms ?? ''}
                            </div>
                          </td>
                        ))}
                      </tr>
                      {d.quotes.some((q) => q.files.length > 0) && (
                        <tr>
                          <td>Quotation</td>
                          {d.quotes.map((q) => (
                            <td key={q.id} className="num">
                              {q.files.length ? <QuoteFileLinks files={q.files} /> : <span className="faint">-</span>}
                            </td>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {d.receipts.length > 0 && (
              <div className="o-panel flush">
                <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                  <h2>Goods receipts</h2>
                </div>
                <table className="o-table">
                  <thead>
                    <tr>
                      <th>Delivery note</th>
                      <th>Date</th>
                      <th>Condition</th>
                      <th>Documents</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.receipts.map((g) => (
                      <tr key={g.id}>
                        <td>
                          <strong>{g.deliveryNote}</strong>
                          <div className="faint" style={{ fontSize: 11 }}>
                            At the {RECEIVED_AT[g.receivedAt].toLowerCase()}
                            {g.intoStock ? ', booked into stock' : ''}
                          </div>
                        </td>
                        <td>{fmtDate(g.at)}</td>
                        <td>
                          <Chip tone={g.condition === 'Good' ? 'ok' : 'warn'}>{g.condition}</Chip>
                        </td>
                        <td>{g.docsOk ? 'Received' : '-'}</td>
                        <td className="muted">{g.by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <ReceiptDocs d={d} />

            <div className="o-panel">
              <h2>Timeline</h2>
              <ol className="p-timeline">
                {[...d.events].reverse().map((e) => (
                  <li key={e.id} className={e.kind}>
                    <div>
                      <strong>{e.text}</strong>
                      {e.note && <div className="p-note">“{e.note}”</div>}
                    </div>
                    <span className="faint">
                      {e.by} · {fmtDate(e.at)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="o-stack">
            <div className="o-panel p-action">
              <h2>{r.stage === 'closed' ? 'Closed' : r.stage === 'rejected' ? 'Rejected' : `Now: ${r.stageLabel}`}</h2>
              {d.owner && (
                <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
                  Waiting on {d.owner.label}
                  {d.owner.people.length ? `: ${d.owner.people.join(', ')}` : ' (nobody has this role yet)'}
                </p>
              )}
              {d.canAct || r.stage === 'inspection' ? (
                <StepFor d={d} suppliers={suppliers} />
              ) : r.stage === 'closed' || r.stage === 'rejected' ? (
                <p className="faint" style={{ fontSize: 12 }}>Nothing more to do.</p>
              ) : (
                <p className="faint" style={{ fontSize: 12 }}>You can follow this request. The next step is for {d.owner?.label.toLowerCase() ?? 'someone else'}.</p>
              )}
              {d.canIssueStock && r.stage !== 'stock_issue' && (
                <div className="p-subcard" style={{ marginTop: 12 }}>
                  <strong style={{ fontSize: 13 }}>Reserved stock to issue</strong>
                  <IssueStockStep d={d} />
                </div>
              )}
            </div>

            <div className="o-panel">
              <h2>Value</h2>
              <div className="o-kv">
                <span>{r.awardQuoteId ? 'Awarded' : 'Estimate'} (to buy)</span>
                <span>{fmtMoney(cur, d.money.value)}</span>
              </div>
              <div className="o-kv">
                <span>
                  {d.cfg.money.taxName} {''}
                </span>
                <span>{fmtMoney(cur, d.money.tax)}</span>
              </div>
              <div className="o-kv total">
                <span>Total</span>
                <span>{fmtMoney(cur, d.money.total)}</span>
              </div>
              {r.invoice && (
                <div className="o-kv">
                  <span>Invoice {r.invoice.no}</span>
                  <span>
                    {fmtMoney(cur, r.invoice.amount)} ({r.invoice.variancePct.toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>

            <div className="o-panel">
              <h2>Approvals</h2>
              {d.approvals.map((a) => (
                <div key={a.kind} className="p-appr">
                  <div className="p-appr-head">
                    <strong>{a.label}</strong>
                    <Chip tone={a.state === 'done' ? 'ok' : a.state === 'now' ? 'warn' : a.state === 'rejected' ? 'bad' : 'grey'}>
                      {a.state === 'off' ? 'Switched off' : a.state === 'none' ? 'Not needed' : a.state === 'done' ? 'Approved' : a.state === 'now' ? 'Waiting' : a.state === 'rejected' ? 'Rejected' : 'Later'}
                    </Chip>
                  </div>
                  {a.state === 'off' ? (
                    <p className="faint" style={{ fontSize: 11, margin: '4px 0 0' }}>
                      This step is switched off in Purchase workflow.
                    </p>
                  ) : a.chain.length === 0 ? (
                    <p className="faint" style={{ fontSize: 11, margin: '4px 0 0' }}>
                      No approval rule applies to this value.
                    </p>
                  ) : (
                    <ol className="p-chain" style={{ marginTop: 6 }}>
                      {a.chain.map((l) => (
                        <li key={l.id} className={l.state === 'done' ? 'done' : l.state === 'now' ? 'now' : ''}>
                          <div>
                            <strong>{l.name}</strong>
                            <div className="faint" style={{ fontSize: 11 }}>
                              {l.people.length ? l.people.join(', ') : `Nobody is ${l.role.toLowerCase()} yet`}
                            </div>
                          </div>
                          <span className="faint">{l.state === 'done' ? 'Approved' : l.state === 'now' ? 'Waiting' : a.state === 'later' ? 'After award' : 'Next'}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {a.state === 'later' && a.kind === 'po' && (
                    <p className="faint" style={{ fontSize: 11, margin: '4px 0 0' }}>
                      Based on the {a.basis}; checked again on the awarded value.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StepFor({ d, suppliers }: { d: RequestDetail; suppliers: SupplierRow[] }) {
  switch (d.request.stage) {
    case 'stock_check':
      return <StockCheckStep d={d} />;
    case 'pr_approval':
    case 'po_approval':
      return <ApprovalStep d={d} />;
    case 'rfq':
      return <QuotesStep d={d} suppliers={suppliers} />;
    case 'issue':
      return <IssuePoStep d={d} />;
    case 'receiving':
      return <ReceiveStep d={d} />;
    case 'inspection':
      return <InspectStep d={d} />;
    case 'invoice':
      return <InvoiceStep d={d} />;
    case 'stock_issue':
      return <IssueStockStep d={d} />;
    default:
      return null;
  }
}
