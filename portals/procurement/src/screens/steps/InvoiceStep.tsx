'use client';
import { useState } from 'react';
import { Button } from '@orbit/ui';
import { invoiceAction } from '../../actions';
import type { RequestDetail } from '../../server';
import { fmtMoney } from '../ui';
import { useStep } from './useStep';

/** Three-way match: PO, receipt and supplier invoice within the company tolerance. */
export function InvoiceStep({ d }: { d: RequestDetail }) {
  const { busy, run } = useStep();
  const exp = d.money.expectedInvoice;
  const [no, setNo] = useState('');
  const [amount, setAmount] = useState<number | null>(exp);
  const [override, setOverride] = useState(false);
  const pct = amount && exp ? ((amount - exp) / exp) * 100 : 0;
  const off = Math.abs(pct) > d.cfg.money.tolerance;
  return (
    <div className="o-stack" style={{ gap: 10 }}>
      <div className="o-kv">
        <span>Expected (incl. {d.cfg.money.taxName})</span>
        <strong>{fmtMoney(d.cfg.money.currency, exp)}</strong>
      </div>
      <label className="o-field">
        Invoice no. *
        <input className="o-input" value={no} onChange={(e) => setNo(e.target.value)} />
      </label>
      <label className="o-field">
        Invoice amount *
        <input className="o-input num" type="number" min={0} step="any" value={amount ?? ''} onChange={(e) => setAmount(e.target.value === '' ? null : Number(e.target.value))} />
      </label>
      <div className={off ? 'o-banner bad' : 'o-banner info'} style={{ margin: 0 }}>
        {pct.toFixed(1)}% difference. Tolerance is {d.cfg.money.tolerance}%.
      </div>
      {off && (
        <label className="o-row" style={{ gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
          Approve the difference
        </label>
      )}
      <Button variant="primary" block disabled={busy || !no || !amount || (off && !override)} onClick={() => run(() => invoiceAction({ id: d.request.id, no, amount: amount ?? 0, override }), 'Invoice matched. Request closed.')}>
        Match invoice
      </Button>
    </div>
  );
}
