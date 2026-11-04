'use client';
import { useState } from 'react';
import { Button, Segmented } from '@orbit/ui';
import { inspectAction } from '../../actions';
import type { RequestDetail } from '../../server';
import { useStep } from './useStep';

type Result = 'Pass' | 'Conditional' | 'Fail';

export function InspectStep({ d }: { d: RequestDetail }) {
  const { busy, run } = useStep();
  const [result, setResult] = useState<Result>('Pass');
  const [note, setNote] = useState('');
  const checks = d.cfg.options.filter((o) => o.qcCheck);
  const [ticked, setTicked] = useState<string[]>([]);
  return (
    <div className="o-stack" style={{ gap: 10 }}>
      <Segmented<Result> value={result} onChange={setResult} options={[{ value: 'Pass', label: 'Pass' }, { value: 'Conditional', label: 'Conditional' }, { value: 'Fail', label: 'Fail' }]} />
      {result !== 'Fail' &&
        checks.map((o) => (
          <label key={o.id} className="o-row" style={{ gap: 8, fontSize: 13, flexWrap: 'nowrap' }}>
            <input type="checkbox" checked={ticked.includes(o.id)} onChange={(e) => setTicked((t) => (e.target.checked ? [...t, o.id] : t.filter((x) => x !== o.id)))} />
            {o.qcCheck}
          </label>
        ))}
      <label className="o-field">
        Notes {result !== 'Pass' ? '*' : ''}
        <textarea className="o-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Dimensions, finish and certificates checked" />
      </label>
      <Button
        variant={result === 'Fail' ? 'danger' : 'primary'}
        block
        disabled={busy}
        onClick={() => run(() => inspectAction({ id: d.request.id, result, note, checks: ticked }), result === 'Fail' ? 'Non-conformance raised.' : 'Inspection saved.')}
      >
        Save inspection
      </Button>
    </div>
  );
}
