export type ChipTone = 'grey' | 'steel' | 'ok' | 'warn' | 'bad' | 'hivis';

const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  draft: { label: 'Draft', tone: 'grey' },
  in_approval: { label: 'In approval', tone: 'steel' },
  returned: { label: 'Returned', tone: 'warn' },
  locked: { label: 'Locked', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
  not_started: { label: 'Not started', tone: 'grey' },
  pending: { label: 'Pending', tone: 'warn' },
  active: { label: 'Active', tone: 'ok' },
  disabled: { label: 'Disabled', tone: 'grey' },
  blocked: { label: 'Blocked', tone: 'bad' },
  removed: { label: 'Removed', tone: 'grey' },
};

/** Draft (grey), In approval (steel), Returned (warn), Locked (ok), Rejected (bad), Revision n (grey). */
/** `label` replaces the English status name (for other languages). */
export function StatusChip({ status, revision, label }: { status: string; revision?: number; label?: string }) {
  const s0 = STATUS[status] ?? { label: status, tone: 'grey' as const };
  const s = label ? { ...s0, label } : s0;
  return (
    <span className="o-row" style={{ gap: 4, display: 'inline-flex' }}>
      <span className={`o-chip dot ${s.tone === 'grey' ? '' : s.tone}`}>{s.label}</span>
      {revision ? <span className="o-chip">Revision {revision}</span> : null}
    </span>
  );
}

export function Chip({ tone = 'grey', children }: { tone?: ChipTone; children: React.ReactNode }) {
  return <span className={`o-chip ${tone === 'grey' ? '' : tone}`}>{children}</span>;
}
