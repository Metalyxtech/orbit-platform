'use client';
import { useState, useTransition } from 'react';
import { Button, ConfirmDialog, useToast } from '@orbit/ui';

/** Sandbox reset deletes data, so it always asks first. */
export function ResetButton({ companyName, action }: { companyName: string; action: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <>
      <Button size="small" variant="danger" disabled={pending} onClick={() => setOpen(true)}>
        {pending ? 'Resetting...' : 'Reset sandbox data'}
      </Button>
      <ConfirmDialog
        open={open}
        title={`Reset sandbox data for ${companyName}?`}
        confirmLabel="Delete sandbox data"
        variant="danger"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          start(async () => {
            try {
              await action();
              toast(`Reset started for ${companyName}.`);
            } catch {
              toast('The reset could not be started. Please try again.', 'bad');
            }
          });
        }}
      >
        All timesheets, approvals and uploaded files for this company are deleted. Users, projects and settings stay. This cannot be undone.
      </ConfirmDialog>
    </>
  );
}
