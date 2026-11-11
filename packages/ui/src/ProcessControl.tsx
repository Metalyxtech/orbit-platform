'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from './Controls';
import { Chip } from './StatusChip';
import { useToast } from './Toast';

// GM process control on any page: a red banner while the process is stopped, Stop / Resume with a
// reason for the GM (and company admins), and a comment thread everyone working on it can read and
// add to. The page passes the thread and the two server actions (from @orbit/core/holds-actions).

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

export interface ControlThread {
  entity: string;
  entityId: string;
  hold: { reason: string; by: string; at: string } | null;
  comments: { id: string; kind: 'comment' | 'hold' | 'release'; text: string; by: string; role: string; at: string }[];
  canControl: boolean;
}

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
/** A time in the viewer's local zone (the server renders it in its own zone, so React may see a difference). */
const At = ({ iso }: { iso: string }) => (
  <time dateTime={iso} suppressHydrationWarning>
    {when(iso)}
  </time>
);

/** The red "on hold" banner for the top of a page. */
export function HoldBanner({ thread }: { thread: ControlThread }) {
  if (!thread.hold) return null;
  return (
    <div className="o-panel" role="alert" style={{ borderLeft: '4px solid var(--bad)', background: 'var(--bad-tint, #fdecec)' }}>
      <strong>On hold by {thread.hold.by}</strong> <span className="muted" style={{ fontSize: 12 }}>
        since <At iso={thread.hold.at} />
      </span>
      <p style={{ margin: '6px 0 0' }}>“{thread.hold.reason}”</p>
      <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
        Nothing on it can move on until it is resumed. Reply in Comments below.
      </p>
    </div>
  );
}

export function ProcessControl({
  thread,
  setHold,
  comment,
}: {
  thread: ControlThread;
  setHold: (input: { entity: string; entityId: string; hold: boolean; note: string }) => Promise<Result>;
  comment: (input: { entity: string; entityId: string; text: string }) => Promise<Result>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'hold' | 'release' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const key = { entity: thread.entity, entityId: thread.entityId };
  async function go(fn: () => Promise<Result>, done: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast(done);
    setText('');
    setNote('');
    setMode(null);
    router.refresh();
  }
  return (
    <div className="o-panel">
      <div className="o-panel-head">
        <h2>Comments{thread.comments.length ? ` (${thread.comments.length})` : ''}</h2>
        {thread.hold ? <Chip tone="bad">On hold</Chip> : null}
      </div>
      {thread.comments.length > 0 && (
        <ul className="o-stack" style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, gap: 8 }}>
          {thread.comments.map((c) => (
            <li key={c.id} style={{ borderLeft: `3px solid ${c.kind === 'hold' ? 'var(--bad)' : c.kind === 'release' ? 'var(--ok)' : c.role === 'GM' ? 'var(--steel)' : 'var(--line)'}`, paddingLeft: 8 }}>
              <div style={{ fontSize: 12 }}>
                <strong>{c.by}</strong>
                {c.role && <span className="faint"> · {c.role}</span>}
                <span className="faint">
                  {' · '}
                  <At iso={c.at} />
                </span>
                {c.kind !== 'comment' && (
                  <span style={{ marginLeft: 6 }}>
                    <Chip tone={c.kind === 'hold' ? 'bad' : 'ok'}>{c.kind === 'hold' ? 'Stopped' : 'Resumed'}</Chip>
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.text}</div>
            </li>
          ))}
        </ul>
      )}
      <div className="o-stack" style={{ gap: 6 }}>
        <textarea className="o-input" rows={2} placeholder="Write a comment for everyone working on this…" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} aria-label="Comment" />
        <div className="o-row" style={{ gap: 6, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Button size="small" variant="primary" disabled={busy || text.trim().length < 2} onClick={() => go(() => comment({ ...key, text }), 'Comment added.')}>
            Comment
          </Button>
          {thread.canControl && !mode && (
            <Button size="small" variant={thread.hold ? 'ok' : 'danger'} onClick={() => setMode(thread.hold ? 'release' : 'hold')}>
              {thread.hold ? 'Resume process' : 'Stop (hold) process'}
            </Button>
          )}
        </div>
        {mode && (
          <div className="o-stack" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <strong style={{ fontSize: 13 }}>{mode === 'hold' ? 'Stop this process' : 'Resume this process'}</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              {mode === 'hold' ? 'Nobody can move it to the next step until you resume it. Everyone on it sees your reason.' : 'It continues from where it stopped. Everyone on it sees your note.'}
            </span>
            <textarea className="o-input" rows={2} placeholder={mode === 'hold' ? 'Reason (required)' : 'Note for the team (required)'} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} aria-label={mode === 'hold' ? 'Reason for stopping' : 'Note for resuming'} />
            <div className="o-row" style={{ gap: 6 }}>
              <Button size="small" variant={mode === 'hold' ? 'danger' : 'ok'} disabled={busy || note.trim().length < 3} onClick={() => go(() => setHold({ ...key, hold: mode === 'hold', note }), mode === 'hold' ? 'Process stopped.' : 'Process resumed.')}>
                {mode === 'hold' ? 'Stop process' : 'Resume process'}
              </Button>
              <Button size="small" onClick={() => setMode(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
