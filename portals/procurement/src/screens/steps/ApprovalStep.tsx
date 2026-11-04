'use client';
import { useState } from 'react';
import { Button } from '@orbit/ui';
import { approveAction, rejectAction } from '../../actions';
import type { RequestDetail } from '../../server';
import { useStep } from './useStep';

export function ApprovalStep({ d }: { d: RequestDetail }) {
  const { busy, run } = useStep();
  const [note, setNote] = useState('');
  return (
    <div className="o-stack" style={{ gap: 10 }}>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        You approve as <strong>{d.approval.pending?.name}</strong>.
      </p>
      <label className="o-field">
        Comment (required to reject)
        <textarea className="o-textarea" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="o-row">
        <Button variant="ok" disabled={busy} onClick={() => run(() => approveAction({ id: d.request.id, note }), 'Approved.')}>
          Approve
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => run(() => rejectAction({ id: d.request.id, note }), 'Rejected.')}>
          Reject
        </Button>
      </div>
    </div>
  );
}
