'use client';
import { Button } from '@orbit/ui';
import { issueStockAction } from '../../actions';
import type { RequestDetail } from '../../server';
import { fmtQty } from '../ui';
import { useStep } from './useStep';

/** Storekeeper issues the reserved stock to the project. */
export function IssueStockStep({ d }: { d: RequestDetail }) {
  const { busy, run } = useStep();
  const lines = d.lines.filter((l) => l.reserveState === 'reserved');
  const to = d.origin ? `the production store (${d.origin.ref})` : d.request.project;
  return (
    <div className="o-stack" style={{ gap: 8 }}>
      {lines.map((l) => (
        <div key={l.id} className="o-kv">
          <span>{l.description}</span>
          <span>
            {fmtQty(l.reservedQty)} {l.unit}
          </span>
        </div>
      ))}
      <Button variant="primary" block disabled={busy} onClick={() => run(() => issueStockAction({ id: d.request.id }), `Stock issued to ${to}.`)}>
        Issue to {to}
      </Button>
    </div>
  );
}
