'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ApprovalRoute, Button, ConfirmDialog, StatusChip, TopBar } from '@orbit/ui';
import { addDays } from '../../calc';
import type { TsKey } from '../../i18n';
import { useTs } from '../useTs';
import type { SaveState, WeekEditor } from './useWeekEditor';

const SAVED: Record<SaveState, TsKey | null> = { idle: null, saving: 'saving', saved: 'saved', offline: 'offline', error: 'serverError' };
const STATUS_KEY: Record<string, TsKey> = { draft: 'statusDraft', in_approval: 'statusInApproval', returned: 'statusReturned', locked: 'statusLocked' };

/**
 * The part of My week every form shares: week switcher, banners, totals, who will approve,
 * note and submit. The form itself is `children`; `actions` sit next to the week title.
 */
export function WeekFrame({ e, actions, children }: { e: WeekEditor; actions?: ReactNode; children: ReactNode }) {
  const { view, totals, readOnly, saveState } = e;
  const { t, day: dayOf, date: dateOf } = useTs();
  const range = `${dateOf(view.days[0].date)} – ${dateOf(view.days[6].date)}`;
  const deadline = view.deadline ? `${dayOf(view.deadline.date)} ${dateOf(view.deadline.date)}, ${view.deadline.time}` : view.deadlineLabel;
  const savedText = (s: SaveState) => (SAVED[s] ? t(SAVED[s]!) : '');
  const weekLabel = t('week', { n: view.weekNumber });
  const status = view.timesheet.status;
  return (
    <>
      <TopBar crumbs={[t('timesheet'), t('myWeek')]}>
        <span className={`o-saved ${saveState === 'offline' || saveState === 'error' ? 'off' : ''}`} aria-live="polite">
          {savedText(saveState)}
        </span>
        <Link className="o-btn small" href={`?week=${addDays(view.weekStart, -7)}`}>
          {t('previous')}
        </Link>
        <span className="o-btn small" style={{ cursor: 'default' }}>
          <strong>{weekLabel}</strong> <span className="muted">{range}</span>
        </span>
        <Link className="o-btn small" href={`?week=${addDays(view.weekStart, 7)}`}>
          {t('next')}
        </Link>
      </TopBar>

      <div className="o-page">
        {status === 'returned' && view.timesheet.returnComment && (
          <div className="o-banner">{t('returnedBanner', { by: view.timesheet.returnedBy ?? '-', comment: view.timesheet.returnComment })}</div>
        )}
        {status === 'locked' && <div className="o-banner info">{t('lockedWeek')}</div>}
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
                  <StatusChip status={status} revision={view.timesheet.revision || undefined} label={STATUS_KEY[status] ? t(STATUS_KEY[status]) : undefined} />
                </div>
                <p>
                  {t('submitBy', { date: deadline })} {readOnly ? '' : t('savedAsYouType')}
                </p>
              </div>
              {!readOnly && actions && <div className="o-row">{actions}</div>}
            </div>
            <RosterStrip e={e} />
            {children}
          </div>

          <div className="o-stack">
            <div className="o-panel">
              <h2>{t('thisWeek')}</h2>
              <div className="o-kv">
                <span>{t('regularHours')}</span>
                <span>{totals.regular.toFixed(1)}</span>
              </div>
              <div className="o-kv">
                <span>{t('overtime')}</span>
                <span className={totals.overtime > 0 ? 'hivis' : ''}>{totals.overtime.toFixed(1)}</span>
              </div>
              {totals.overtime > 0 && (totals.rostered || view.plan.some((p) => p.preApproved > 0)) && (
                <>
                  <div className="o-kv" style={{ fontSize: 12 }}>
                    <span className="muted">{t('preApproved')}</span>
                    <span>{totals.preApprovedOt.toFixed(1)}</span>
                  </div>
                  <div className="o-kv" style={{ fontSize: 12 }}>
                    <span className="muted">{t('notPreApproved')}</span>
                    <span className={totals.notPreApprovedOt > 0 ? 'hivis' : ''}>{totals.notPreApprovedOt.toFixed(1)}</span>
                  </div>
                </>
              )}
              {totals.offdayOt > 0 && (
                <div className="o-kv" style={{ fontSize: 12 }}>
                  <span className="muted">{t('onDaysOff')}</span>
                  <span>{totals.offdayOt.toFixed(1)}</span>
                </div>
              )}
              <div className="o-kv total">
                <span>{t('total')}</span>
                <span>{totals.total.toFixed(1)}</span>
              </div>
              <p className="faint" style={{ fontSize: 12, margin: '8px 0 0' }}>
                {t('otHint')} <Link href="/timesheet/overtime">{t('otHintLink')}</Link>.
              </p>
            </div>

            <div className="o-panel">
              <h2>{t('whoApproves')}</h2>
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
                  {t('noteForApprover')}
                  <textarea className="o-textarea" value={e.note} maxLength={2000} onChange={(ev) => e.setNote(ev.target.value)} />
                </label>
                <div style={{ marginTop: 12 }}>
                  <Button variant="primary" block disabled={e.submitting || totals.total === 0} onClick={() => e.setConfirm(true)}>
                    {status === 'returned' ? t('submitWeekAgain', { n: view.weekNumber }) : t('submitWeek', { n: view.weekNumber })}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="phone-only o-saved" style={{ textAlign: 'center' }}>
          {saveState === 'offline' ? t('savedOnPhone') : savedText(saveState)}
        </div>
      </div>

      <ConfirmDialog
        open={e.confirm}
        title={t('confirmTitle', { n: view.weekNumber })}
        confirmLabel={t('submit')}
        cancelLabel={t('cancel')}
        onConfirm={e.doSubmit}
        onCancel={() => e.setConfirm(false)}
      >
        {t('confirmBody', { total: totals.total.toFixed(1), ot: totals.overtime.toFixed(1) })}
        {view.days.some((d, i) => d.weeklyOff && totals.dayTotals[i] > 0) && (
          <div className="o-banner" style={{ marginTop: 8 }}>
            {t('weeklyOffWarning')}
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

/** The person's published roster for the week, above the hours. Shown once anything is planned. */
function RosterStrip({ e }: { e: WeekEditor }) {
  const { view, totals } = e;
  const { t, day: dayOf, date: dateOf } = useTs();
  if (!view.plan.some((p) => p.kind || p.holiday)) return null;
  return (
    <div className="o-panel" aria-label={t('yourRoster')}>
      <h2 style={{ margin: '0 0 8px', fontSize: 14 }}>{t('yourRoster')}</h2>
      <div className="ts-roster-strip">
        {view.days.map((d, i) => {
          const p = view.plan[i];
          const label = p.holiday ? p.holiday : p.kind === 'shift' ? p.shiftName : p.kind === 'off' ? t('dayOff') : p.kind === 'leave' ? (p.shiftName ?? t('leave')) : d.weeklyOff ? t('weeklyOff') : t('notRostered');
          const time = p.kind === 'shift' && p.start ? `${p.start}-${p.end}` : '';
          return (
            <div key={d.date} className={`ts-roster-day${p.kind === 'shift' ? '' : ' off'}${totals.overDays[i] ? ' over' : ''}`} style={p.kind === 'shift' && p.color ? { borderTopColor: p.color } : undefined}>
              <span className="faint">
                {dayOf(d.date)} {dateOf(d.date)}
              </span>
              <strong>{label}</strong>
              {time && <span className="muted">{time}</span>}
              {p.preApproved > 0 && <span className="o-chip ok">{t('otApproved', { h: p.preApproved })}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
