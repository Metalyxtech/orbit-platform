'use client';
import { useState } from 'react';
import { Button, Chip } from '@orbit/ui';
import { acceptWithoutQcAction, requestReinspectionAction } from '../../actions';
import type { RequestDetail } from '../../server';
import { useStep } from './useStep';

/**
 * Quality inspection is done in the Quality portal (QC engineer, then QC manager). Here the
 * Purchase team sees where it is; after a fail they ask QC to inspect again once the supplier
 * has rectified. Without the Quality portal the manager accepts the material.
 */
export function InspectStep({ d }: { d: RequestDetail }) {
  const { busy, run } = useStep();
  const [note, setNote] = useState('');
  const last = d.qc.last;
  if (!d.qc.on)
    return (
      <div className="o-stack" style={{ gap: 10 }}>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Your company does not use the Quality portal, so material is accepted on receipt.
        </p>
        {['manager', 'admin'].includes(d.me) && (
          <Button variant="primary" disabled={busy} onClick={() => run(() => acceptWithoutQcAction({ id: d.request.id }), 'Material accepted.')}>
            Accept material
          </Button>
        )}
      </div>
    );
  const failed = last?.status === 'approved' && last.result === 'fail';
  return (
    <div className="o-stack" style={{ gap: 10 }}>
      <div className="o-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>{last ? `${last.number}${last.round > 1 ? ` (round ${last.round})` : ''}` : 'Waiting for QC'}</strong>
        {last && (last.status === 'pending' ? <Chip tone="hivis">With QC engineer</Chip> : last.status === 'submitted' ? <Chip tone="warn">With QC manager</Chip> : failed ? <Chip tone="bad">QC failed</Chip> : <Chip tone="ok">QC passed</Chip>)}
      </div>
      {failed ? (
        <>
          <p style={{ fontSize: 13, margin: 0 }}>
            <strong>Non-conformance:</strong> {last!.ncr ?? '-'}
          </p>
          {['buyer', 'store', 'manager', 'admin'].includes(d.me) && (
            <>
              <label className="o-field">
                What did the supplier rectify?
                <input className="o-input" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
              </label>
              <Button variant="primary" disabled={busy || note.trim().length < 3} onClick={() => run(() => requestReinspectionAction({ id: d.request.id, note }), 'Sent to QC again.')}>
                Ask QC to inspect again
              </Button>
            </>
          )}
        </>
      ) : !last ? (
        ['buyer', 'store', 'manager', 'admin'].includes(d.me) && (
          <Button variant="primary" disabled={busy} onClick={() => run(() => requestReinspectionAction({ id: d.request.id, note: '' }), 'Sent to QC.')}>
            Send to QC
          </Button>
        )
      ) : (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          QC inspects the material in the Quality portal; the QC manager gives final approval. The request moves on by itself when QC passes it.
        </p>
      )}
    </div>
  );
}
