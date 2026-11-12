import Link from 'next/link';
import { Chip } from '@orbit/ui';
import { fmtDate, fmtQty, MR_STATUS } from '../config';
import type { WoDetail, WoSupply } from '../server';
import { mrHref, Progress } from './ui';

/** A percentage as a ring, for the "at a glance" strip. */
export function Ring({ value, tone }: { value: number; tone?: 'ok' | 'bad' }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const color = tone === 'bad' ? 'var(--bad)' : v >= 100 || tone === 'ok' ? 'var(--ok)' : 'var(--steel)';
  return (
    <svg className="w-ring" viewBox="0 0 64 64" width={64} height={64} role="img" aria-label={`${v}% done`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--line-2)" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--ink)">
        {v}%
      </text>
    </svg>
  );
}

/** Work order at a glance: progress, materials, due date, effort, and what it is waiting on in plain words. */
export function WoSummary({ d }: { d: WoDetail }) {
  const s = d.summary;
  const w = d.wo;
  const closed = w.status === 'dispatched' || w.status === 'cancelled';
  const late = s.daysLeft !== null && s.daysLeft < 0 && !closed && w.status !== 'completed';
  return (
    <section className="w-sum" aria-label="At a glance">
      <div className="w-stat">
        <Ring value={s.progress} tone={w.returnedNote && w.status === 'in_progress' ? 'bad' : undefined} />
        <div>
          <span className="w-l">Production</span>
          <strong>
            {s.opsDone} of {s.opsTotal} operations done
          </strong>
          <small>{s.current ? `Now: ${s.current.name}` : s.opsDone === s.opsTotal && s.opsTotal ? 'All operations finished' : 'Not started on the floor'}</small>
        </div>
      </div>
      <div className="w-stat">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="w-l">Materials</span>
          {s.materialsPct === null ? <strong>No materials planned</strong> : <strong>{s.materialsPct}% issued to the floor</strong>}
          {s.materialsPct !== null && <Progress value={s.materialsPct} />}
          <small>
            {s.openRequests === 0
              ? 'No material request open'
              : `${s.openRequests} ${s.openRequests === 1 ? 'request' : 'requests'} open${s.withPurchase ? `, ${s.withPurchase} with Purchase` : ''}`}
          </small>
        </div>
      </div>
      <div className="w-stat">
        <div>
          <span className="w-l">Due date</span>
          <strong className={late ? 'bad' : undefined}>
            {s.daysLeft === null
              ? 'No due date'
              : closed || w.status === 'completed'
                ? fmtDate(w.due)
                : late
                  ? `${-s.daysLeft} ${s.daysLeft === -1 ? 'day' : 'days'} late`
                  : s.daysLeft === 0
                    ? 'Due today'
                    : `${s.daysLeft} ${s.daysLeft === 1 ? 'day' : 'days'} left`}
          </strong>
          <small>{s.daysLeft === null ? 'Set one in the plan' : `Due ${fmtDate(w.due)}`}</small>
        </div>
      </div>
      <div className="w-stat">
        <div>
          <span className="w-l">Effort so far</span>
          <strong>{fmtQty(s.hours)} hours reported</strong>
          <small>{s.lastReport ? `Last report ${fmtDate(s.lastReport)}` : 'No daily report yet'}</small>
        </div>
      </div>
      {s.waiting.length > 0 && !closed && (
        <div className="w-wait">
          <span className="w-l">Waiting on</span>
          <ul>
            {s.waiting.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const STEPS = ['Requested', 'Production store', 'Approval', 'Purchase', 'Arrived', 'Issued'];
const AT: Record<WoSupply['status'], number> = { store: 1, engineer: 2, manager: 2, purchase: 3, ready: 4, issued: 6, rejected: -1, cancelled: -1 };

/**
 * A work order's material requests on one screen: where each request is, the purchase behind it
 * (request and PO number, stage) when the company uses Purchase, and every line's quantities.
 */
export function SupplyPanel({ supply, purchaseUsed }: { supply: WoSupply[]; purchaseUsed: boolean }) {
  if (!supply.length) return null;
  return (
    <div className="o-panel">
      <div className="o-panel-head">
        <h2>{purchaseUsed ? 'Material requests and purchasing' : 'Material requests'}</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          {supply.filter((m) => m.status === 'issued').length} of {supply.length} issued
        </span>
      </div>
      <div className="o-stack" style={{ gap: 14 }}>
        {supply.map((m) => {
          const at = AT[m.status];
          const st = MR_STATUS[m.status];
          return (
            <article key={m.id} className="w-mr">
              <header>
                <Link href={mrHref(m.id)}>
                  <strong>{m.number}</strong>
                </Link>
                <Chip tone={st.tone}>{st.label}</Chip>
                <span className="faint">
                  {m.by ? `Requested by ${m.by} · ` : ''}
                  {fmtDate(m.at)}
                  {at > 0 && at < 6 ? ` · ${m.days === 0 ? 'today' : `${m.days} ${m.days === 1 ? 'day' : 'days'}`} at this step` : ''}
                </span>
              </header>
              {at > 0 && (
                <ol className="w-steps" aria-label={`${m.number} progress`}>
                  {STEPS.map((label, i) => (
                    <li key={label} className={i < at ? 'done' : i === at ? 'now' : ''}>
                      {label}
                    </li>
                  ))}
                </ol>
              )}
              {m.purchaseRef && (
                <p className="w-po">
                  <span>Purchase request</span>
                  {purchaseUsed && m.purchaseId ? <Link href={`/procurement/request?id=${m.purchaseId}`}>{m.purchaseRef}</Link> : <strong>{m.purchaseRef}</strong>}
                  {m.purchase?.poNo && (
                    <>
                      <span>Purchase order</span>
                      <strong>{m.purchase.poNo}</strong>
                    </>
                  )}
                  {m.purchase && (
                    <>
                      <span>Stage</span>
                      <strong>{m.purchase.stageLabel}</strong>
                    </>
                  )}
                </p>
              )}
              {m.returnNote && m.status !== 'issued' && <div className="o-banner">{m.returnNote}</div>}
              <div className="o-scroll">
                <table className="o-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="num">Requested</th>
                      <th className="num">Buying</th>
                      <th className="num">Arrived</th>
                      <th className="num">Issued</th>
                      <th style={{ width: 150 }}>Issued to floor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.lines.map((l, i) => (
                      <tr key={i}>
                        <td>{l.item}</td>
                        <td className="num">
                          {fmtQty(l.qty)} {l.unit}
                        </td>
                        <td className="num">{l.toBuy ? fmtQty(l.toBuy) : <span className="faint">-</span>}</td>
                        <td className="num">{l.toBuy ? fmtQty(l.received) : <span className="faint">-</span>}</td>
                        <td className="num">{fmtQty(l.issued)}</td>
                        <td>
                          <Progress value={l.qty ? Math.round((Math.min(l.issued, l.qty) / l.qty) * 100) : 0} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
