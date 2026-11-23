'use client';
import { useState } from 'react';
import { Button } from '@orbit/ui';
import { stockCheckAction } from '../../actions';
import type { RequestDetail } from '../../server';
import { fmtQty } from '../ui';
import { useStep } from './useStep';

/** Stock check: take what is available from stock; the rest goes to purchase. */
export function StockCheckStep({ d }: { d: RequestDetail }) {
  const { busy, run } = useStep();
  const [take, setTake] = useState(d.lines.map((l) => (l.item ? Math.max(0, Math.min(l.qty, l.item.available)) : 0)));
  const linked = d.lines.filter((l) => l.item);
  return (
    <div className="o-stack" style={{ gap: 10 }}>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        {linked.length ? 'Reserve what the store has. Only the shortfall is bought.' : 'No line is linked to a stock item, so everything will be bought.'}
      </p>
      {d.lines.map((l, i) =>
        l.item ? (
          <label key={l.id} className="o-field">
            {l.description}
            <span className="faint" style={{ fontSize: 11 }}>
              Need {fmtQty(l.qty)} {l.unit}, {fmtQty(l.item.available)} available ({l.item.code})
            </span>
            <input
              className="o-input num"
              type="number"
              min={0}
              max={Math.min(l.qty, l.item.available)}
              step="any"
              value={take[i]}
              onChange={(e) => setTake((t) => t.map((v, j) => (j === i ? Number(e.target.value) : v)))}
              aria-label={`From stock: ${l.description}`}
            />
          </label>
        ) : null,
      )}
      <Button variant="primary" block disabled={busy} onClick={() => run(() => stockCheckAction({ id: d.request.id, fromStock: take }), 'Stock check saved.')}>
        Confirm stock check
      </Button>
    </div>
  );
}
