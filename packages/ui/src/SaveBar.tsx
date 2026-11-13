'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, ConfirmDialog } from './Controls';

/**
 * Admin pages keep edits as a draft. While there are unsaved changes this bar stays at the bottom
 * of the screen; Save asks for confirmation first, so a stray click never changes the flow.
 */
export function SaveBar({
  dirty,
  busy,
  what,
  impact,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  busy?: boolean;
  /** e.g. "the purchase workflow" */
  what: string;
  /** One sentence on who is affected, shown in the confirmation. */
  impact?: ReactNode;
  onSave: () => void | Promise<unknown>;
  onDiscard: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return (
    <>
      {dirty && (
        <div className="o-savebar" role="region" aria-label="Unsaved changes">
          <span>
            <strong>Unsaved changes</strong> to {what}
          </span>
          <div className="o-row" style={{ gap: 8 }}>
            <Button disabled={busy} onClick={onDiscard}>
              Discard
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => setConfirm(true)}>
              Save changes
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title={`Save changes to ${what}?`}
        confirmLabel="Yes, save"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await onSave();
        }}
      >
        {impact ?? 'The change applies straight away for everyone in the company.'} It is recorded in Change history.
      </ConfirmDialog>
    </>
  );
}

/** Small confirm-before-acting helper for one-click admin buttons (give access, remove, change role). */
export function useConfirm() {
  const [ask, setAsk] = useState<{ title: string; body: ReactNode; label: string; danger?: boolean; run: () => void } | null>(null);
  const dialog = (
    <ConfirmDialog
      open={!!ask}
      title={ask?.title ?? ''}
      confirmLabel={ask?.label ?? 'Confirm'}
      variant={ask?.danger ? 'danger' : 'primary'}
      onCancel={() => setAsk(null)}
      onConfirm={() => {
        const run = ask?.run;
        setAsk(null);
        run?.();
      }}
    >
      {ask?.body}
    </ConfirmDialog>
  );
  return { confirm: setAsk, dialog };
}
