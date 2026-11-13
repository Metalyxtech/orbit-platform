'use client';
import { useState } from 'react';
import { Button } from '@orbit/ui';
import { issuePoAction } from '../../actions';
import type { RequestDetail } from '../../server';
import { useStep } from './useStep';

/** Issue the purchase order (after any industry pre-PO confirmations). */
export function IssuePoStep({ d }: { d: RequestDetail }) {
  const { busy, run } = useStep();
  const checks = d.cfg.options.filter((o) => o.issueCheck);
  const [ticked, setTicked] = useState<string[]>([]);
  return (
    <div className="o-stack" style={{ gap: 10 }}>
      {checks.map((o) => (
        <label key={o.id} className="o-row" style={{ gap: 8, fontSize: 13, flexWrap: 'nowrap' }}>
          <input type="checkbox" checked={ticked.includes(o.id)} onChange={(e) => setTicked((t) => (e.target.checked ? [...t, o.id] : t.filter((x) => x !== o.id)))} />
          {o.issueCheck}
        </label>
      ))}
      <Button variant="primary" block disabled={busy || ticked.length < checks.length} onClick={() => run(() => issuePoAction({ id: d.request.id, checks: ticked }), 'Purchase order issued.')}>
        Issue purchase order
      </Button>
    </div>
  );
}
