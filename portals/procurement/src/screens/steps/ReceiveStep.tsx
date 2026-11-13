'use client';
import { useState } from 'react';
import { Button } from '@orbit/ui';
import { receiveAction } from '../../actions';
import type { RequestDetail } from '../../server';
import { RECEIVED_AT, type ReceivedAt } from '../../config';
import { fmtQty } from '../ui';
import { useStep } from './useStep';

/** Goods receipt: what arrived on this delivery note. Partial deliveries keep the step open. */
export function ReceiveStep({ d }: { d: RequestDetail }) {
  const { busy, run } = useStep();
  const outstanding = d.lines.map((l) => Math.max(0, l.buy - l.received));
  const [qty, setQty] = useState(outstanding);
  const [dn, setDn] = useState('');
  const [condition, setCondition] = useState<'Good' | 'Damaged' | 'Short'>('Good');
  const [docsOk, setDocsOk] = useState(false);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const linked = d.lines.some((l) => l.item);
  const [intoStock, setIntoStock] = useState(false);
  const fromProduction = !!d.origin;
  const [receivedAt, setReceivedAt] = useState<ReceivedAt>(fromProduction ? 'production' : 'purchase');
  const docsRequired = d.cfg.options.some((o) => o.docsRequired);
  const headerFields = d.cfg.options.filter((o) => o.receiptField?.where === 'header');
  const lineFields = d.cfg.options.filter((o) => o.receiptField?.where === 'line');

  return (
    <div className="o-stack" style={{ gap: 10 }}>
      <label className="o-field">
        Delivery note no. *
        <input className="o-input" value={dn} onChange={(e) => setDn(e.target.value)} placeholder="e.g. DN-48812" />
      </label>
      {d.lines.map((l, i) =>
        l.buy > 0 ? (
          <div key={l.id} className="o-field">
            {l.description}
            <span className="faint" style={{ fontSize: 11 }}>
              Ordered {fmtQty(l.buy)} {l.unit}, received {fmtQty(l.received)}
            </span>
            <input className="o-input num" type="number" min={0} step="any" value={qty[i]} onChange={(e) => setQty((q) => q.map((v, j) => (j === i ? Number(e.target.value) : v)))} aria-label={`Received: ${l.description}`} />
            {lineFields.map((o) => (
              <input
                key={o.id}
                className="o-input"
                placeholder={o.receiptField!.label}
                value={extra[`${o.id}:${i}`] ?? ''}
                onChange={(e) => setExtra((x) => ({ ...x, [`${o.id}:${i}`]: e.target.value }))}
                aria-label={`${o.receiptField!.label}: ${l.description}`}
              />
            ))}
          </div>
        ) : null,
      )}
      {headerFields.map((o) => (
        <label key={o.id} className="o-field">
          {o.receiptField!.label}
          <input className="o-input" value={extra[o.id] ?? ''} onChange={(e) => setExtra((x) => ({ ...x, [o.id]: e.target.value }))} />
        </label>
      ))}
      <label className="o-field">
        Received at
        <select className="o-select" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value as ReceivedAt)}>
          {(Object.keys(RECEIVED_AT) as ReceivedAt[]).map((k) => (
            <option key={k} value={k}>
              {RECEIVED_AT[k]}
            </option>
          ))}
        </select>
        {fromProduction && (
          <span className="faint" style={{ fontSize: 11 }}>
            For {d.origin!.ref} ({d.origin!.workOrder}): once accepted it goes into the production store stock.
          </span>
        )}
      </label>
      <label className="o-field">
        Condition
        <select className="o-select" value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)}>
          <option>Good</option>
          <option>Damaged</option>
          <option>Short</option>
        </select>
      </label>
      <label className="o-row" style={{ gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={docsOk} onChange={(e) => setDocsOk(e.target.checked)} />
        Documents received{docsRequired ? ' (required)' : ''}
      </label>
      {linked && !fromProduction && (
        <label className="o-row" style={{ gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={intoStock} onChange={(e) => setIntoStock(e.target.checked)} />
          Book into store stock (instead of straight to site)
        </label>
      )}
      <Button
        variant="primary"
        block
        disabled={busy || !dn || (docsRequired && !docsOk)}
        onClick={() => run(() => receiveAction({ id: d.request.id, deliveryNote: dn, condition, docsOk, extra, qty, intoStock: intoStock && !fromProduction, receivedAt }), 'Goods receipt saved.')}
      >
        Save goods receipt
      </Button>
      <span className="faint" style={{ fontSize: 11 }}>
        Upload the MTC / test certificates under Receipt documents. QC gets them with the inspection.
      </span>
    </div>
  );
}
