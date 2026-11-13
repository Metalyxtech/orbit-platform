'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ConfirmDialog } from '@orbit/ui';
import { removeMemberAction } from './actions';

const WORD = 'REMOVE';

/** "Remove from company" with a typed confirmation, so nobody is removed by a stray click. */
export function RemoveMemberButton({ companyId, membershipId, name, company }: { companyId: string; membershipId: string; name: string; company: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'bad' | 'ok'; text: string } | null>(null);
  const ready = typed.trim().toUpperCase() === WORD;

  async function remove() {
    setBusy(true);
    const res = await removeMemberAction(companyId, membershipId, typed);
    setBusy(false);
    if (!res.ok) return setMessage({ tone: 'bad', text: res.error });
    const s = res.summary;
    const notes = [
      s.approvalsMoved ? `${s.approvalsMoved} waiting approvals moved to a company admin` : '',
      s.supervisorLinksCleared ? `${s.supervisorLinksCleared} people no longer have them as supervisor` : '',
      s.projectsWithoutManager ? `${s.projectsWithoutManager} projects now have no project manager` : '',
    ].filter(Boolean);
    setMessage({ tone: 'ok', text: `${name} was removed from ${company}.${notes.length ? ` ${notes.join('; ')}.` : ''}` });
  }

  function close() {
    const done = message?.tone === 'ok';
    setOpen(false);
    setTyped('');
    setMessage(null);
    // Refresh only after the dialog closes: the row (and this dialog) disappears once the list reloads.
    if (done) router.refresh();
  }

  return (
    <>
      <Button size="small" variant="danger" onClick={() => setOpen(true)}>
        Remove
      </Button>
      <ConfirmDialog
        open={open}
        title={message?.tone === 'ok' ? 'Removed' : `Remove ${name} from ${company}?`}
        confirmLabel={busy ? 'Removing…' : 'Remove from company'}
        variant="danger"
        confirmDisabled={!ready || busy || message?.tone === 'ok'}
        onConfirm={remove}
        onCancel={close}
        cancelLabel={message?.tone === 'ok' ? 'Close' : undefined}
      >
        {message?.tone === 'ok' ? (
          <p style={{ margin: 0 }}>{message.text}</p>
        ) : (
          <div className="o-stack" style={{ gap: 10 }}>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              <li>They lose access to {company} and all its portals straight away.</li>
              <li>Their past timesheets and approvals stay in the company's records.</li>
              <li>Approvals waiting on them move to a company admin; supervisor and project manager links to them are cleared.</li>
              <li>They can then sign in and join or register another company.</li>
            </ul>
            <label className="o-field">
              Type {WORD} to confirm
              <input
                className="o-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={WORD}
                autoComplete="off"
                aria-label={`Type ${WORD} to confirm`}
              />
            </label>
            {message && <div className="o-banner bad">{message.text}</div>}
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
