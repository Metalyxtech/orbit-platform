'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ApprovalRoute, Button, ConfirmDialog, StatusChip, TopBar } from '@orbit/ui';
import { addDays } from '../../calc';
import { messages } from '../../messages';
import type { SaveState, WeekEditor } from './useWeekEditor';

const savedText: Record<SaveState, string> = {
  idle: '',
  saving: 'Saving...',
  saved: 'Saved',
  offline: messages.offline,
  error: messages.serverError,
};

/**
 * The part of My week every form shares: week switcher, banners, totals, who will approve,
 * note and submit. The form itself is `children`; `actions` sit next to the week title.
 */
export function WeekFrame({ e, actions, children }: { e: WeekEditor; actions?: ReactNode; children: ReactNode }) {
  const { view, totals, readOnly, saveState } = e;
  const weekLabel = `Week ${view.weekNumber}`;
  const status = view.timesheet.status;
  return (
    <>
      <TopBar crumbs={['Timesheet', 'My week']}>
        <span className={`o-saved ${saveState === 'offline' || saveState === 'error' ? 'off' : ''}`} aria-live="polite">
          {savedText[saveState]}
        </span>
        <Link className="o-btn small" href={`?week=${addDays(view.weekStart, -7)}`}>
          Previous
        </Link>
        <span className="o-btn small" style={{ cursor: 'default' }}>
          <strong>{weekLabel}</strong> <span className="muted">{view.rangeLabel}</span>
        </span>
        <Link className="o-btn small" href={`?week=${addDays(view.weekStart, 7)}`}>
          Next
        </Link>
      </TopBar>

      <div className="o-page">
        {status === 'returned' && view.timesheet.returnComment && (
          <div className="o-banner">{messages.returnedBanner(view.timesheet.returnedBy ?? 'approver', view.timesheet.returnComment)}</div>
        )}
        {status === 'locked' && <div className="o-banner info">{messages.lockedWeek}</div>}
        {e.issues.length > 0 && (
          <div className="o-banner bad" role="alert">
            {e.issues.map((m) => (
              <div key={m}>{m}</div>
            ))}
          </div>
        )}

        <div className="o-cols">
          <div className="o-stack">
            <div className="o-page-head">
              <div>
                <div className="o-row">
                  <h1>{weekLabel}</h1>
                  <StatusChip status={status} revision={view.timesheet.revision || undefined} />
                </div>
                <p>
                  Submit by {view.deadlineLabel}. {readOnly ? '' : 'Hours are saved as you type.'}
                </p>
              </div>
              {!readOnly && actions && <div className="o-row">{actions}</div>}
            </div>
            <RosterStrip e={e} />
            {children}
          </div>

          <div className="o-stack">
            <div className="o-panel">
              <h2>This week</h2>
              <div className="o-kv">
                <span>Regular hours</span>
                <span>{totals.regular.toFixed(1)}</span>
              </div>
              <div className="o-kv">
                <span>Overtime</span>
                <span className={totals.overtime > 0 ? 'hivis' : ''}>{totals.overtime.toFixed(1)}</span>
              </div>
              {totals.overtime > 0 && (totals.rostered || view.plan.some((p) => p.preApproved > 0)) && (
                <>
                  <div className="o-kv" style={{ fontSize: 12 }}>
                    <span className="muted">Pre-approved</span>
                    <span>{totals.preApprovedOt.toFixed(1)}</span>
                  </div>
                  <div className="o-kv" style={{ fontSize: 12 }}>
                    <span className="muted">Not approved in advance</span>
                    <span className={totals.notPreApprovedOt > 0 ? 'hivis' : ''}>{totals.notPreApprovedOt.toFixed(1)}</span>
                  </div>
                </>
              )}
              {totals.offdayOt > 0 && (
                <div className="o-kv" style={{ fontSize: 12 }}>
                  <span className="muted">Of which on days off</span>
                  <span>{totals.offdayOt.toFixed(1)}</span>
                </div>
              )}
              <div className="o-kv total">
                <span>Total</span>
                <span>{totals.total.toFixed(1)}</span>
              </div>
              <p className="faint" style={{ fontSize: 12, margin: '8px 0 0' }}>
                Working late or on a day off? <Link href="/timesheet/overtime">Ask for overtime in advance</Link>.
              </p>
            </div>

            <div className="o-panel">
              <h2>Who will approve</h2>
              {e.route
                .filter((s) => s.reason)
                .map((s) => (
                  <p key={s.stepIndex} className="muted" style={{ fontSize: 12, marginTop: -6 }}>
                    {s.reason}: {s.name} also approves.
                  </p>
                ))}
              <ApprovalRoute
                items={e.route.flatMap((s) => s.approvers.map((a) => ({ name: a.name, detail: a.title ?? s.name, state: 'next' as const })))}
              />
            </div>

            {!readOnly && (
              <div className="o-panel">
                <label className="o-field">
                  Note for approver (optional)
                  <textarea className="o-textarea" value={e.note} maxLength={2000} onChange={(ev) => e.setNote(ev.target.value)} />
                </label>
                <div style={{ marginTop: 12 }}>
                  <Button variant="primary" block disabled={e.submitting || totals.total === 0} onClick={() => e.setConfirm(true)}>
                    {status === 'returned' ? `Submit ${weekLabel.toLowerCase()} again` : `Submit ${weekLabel.toLowerCase()}`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="phone-only o-saved" style={{ textAlign: 'center' }}>
          {saveState === 'offline' ? 'Saved on this phone. Syncs when online.' : savedText[saveState]}
        </div>
      </div>

      <ConfirmDialog
        open={e.confirm}
        title={`Submit ${weekLabel.toLowerCase()}?`}
        confirmLabel="Submit"
        onConfirm={e.doSubmit}
        onCancel={() => e.setConfirm(false)}
      >
        {totals.total.toFixed(1)} h, of which {totals.overtime.toFixed(1)} h overtime.
        {view.days.some((d, i) => d.weeklyOff && totals.dayTotals[i] > 0) && (
          <div className="o-banner" style={{ marginTop: 8 }}>
            You entered hours on the weekly off.
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

/** The person's published roster for the week, above the hours. Shown once anything is planned. */
function RosterStrip({ e }: { e: WeekEditor }) {
  const { view, totals } = e;
  if (!view.plan.some((p) => p.kind || p.holiday)) return null;
  return (
    <div className="o-panel" aria-label="Your roster this week">
      <h2 style={{ margin: '0 0 8px', fontSize: 14 }}>Your roster</h2>
      <div className="ts-roster-strip">
        {view.days.map((d, i) => {
          const p = view.plan[i];
          const label = p.holiday ? p.holiday : p.kind === 'shift' ? p.shiftName : p.kind === 'off' ? 'Day off' : p.kind === 'leave' ? 'Leave' : d.weeklyOff ? 'Weekly off' : 'Not rostered';
          const time = p.kind === 'shift' && p.start ? `${p.start}-${p.end}` : '';
          return (
            <div key={d.date} className={`ts-roster-day${p.kind === 'shift' ? '' : ' off'}${totals.overDays[i] ? ' over' : ''}`} style={p.kind === 'shift' && p.color ? { borderTopColor: p.color } : undefined}>
              <span className="faint">
                {d.name} {d.label}
              </span>
              <strong>{label}</strong>
              {time && <span className="muted">{time}</span>}
              {p.preApproved > 0 && <span className="o-chip ok">+{p.preApproved} h OT approved</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
