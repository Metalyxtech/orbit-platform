'use client';
import { del, get, set } from 'idb-keyval';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RouteStep } from '@orbit/core/workflow';
import {
  ApprovalRoute,
  Button,
  ConfirmDialog,
  DayBarChart,
  PhoneDayTabs,
  StatusChip,
  Stepper,
  TopBar,
  WeekGrid,
  useToast,
} from '@orbit/ui';
import { copyLastWeekAction, previewRouteAction, saveEntriesAction, submitAction } from '../actions';
import { addDays, computeTotals, parseCell, round2, type GridRow } from '../calc';
import { messages } from '../messages';
import type { WeekRow, WeekView } from '../server/week';

type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

interface Draft {
  rows: GridRow[];
  removed: string[];
  note: string;
  dirty: string[];
}

const newKey = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function MyWeekClient({ view, draftKey }: { view: WeekView; draftKey: string }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<WeekRow[]>(view.rows);
  const [note, setNote] = useState(view.timesheet.note ?? '');
  const [timesheetId, setTimesheetId] = useState(view.timesheet.id);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [route, setRoute] = useState<RouteStep[]>(view.route);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [day, setDay] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    const i = view.days.findIndex((d) => d.date === today);
    return i >= 0 ? i : 0;
  });

  const dirty = useRef(new Set<string>());
  const removed = useRef(new Set<string>());
  const noteDirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const noteRef = useRef(note);
  noteRef.current = note;

  const readOnly = view.readOnly;
  const totals = useMemo(() => computeTotals(rows, view.rules), [rows, view.rules]);

  const options = view.options;
  const label = useCallback(
    (r: GridRow): Pick<WeekRow, 'projectLabel' | 'costCodeLabel'> => {
      const p = options.projects.find((x) => x.id === r.projectId);
      const c = options.costCodes.find((x) => x.id === r.costCodeId);
      return { projectLabel: p ? `${p.code} ${p.name}` : '', costCodeLabel: c ? `${c.code} ${c.name}` : '' };
    },
    [options],
  );

  // ---------- autosave (800 ms idle) with an IndexedDB copy for offline ----------

  const persistDraft = useCallback(async () => {
    const draft: Draft = {
      rows: rowsRef.current.map(({ key, projectId, costCodeId, hours }) => ({ key, projectId, costCodeId, hours })),
      removed: [...removed.current],
      note: noteRef.current,
      dirty: [...dirty.current],
    };
    try {
      await set(draftKey, draft);
    } catch {
      /* private mode: autosave still works online */
    }
  }, [draftKey]);

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    if (dirty.current.size === 0 && removed.current.size === 0 && !noteDirty.current) return true;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSaveState('offline');
      return false;
    }
    const sendKeys = new Set(dirty.current);
    const sendRemoved = [...removed.current];
    const sendNote = noteDirty.current;
    const payload = {
      weekStart: view.weekStart,
      rows: rowsRef.current
        .filter((r) => sendKeys.has(r.key))
        .map(({ key, projectId, costCodeId, hours }) => ({ key, projectId, costCodeId, hours })),
      removedRowKeys: sendRemoved,
      ...(sendNote ? { note: noteRef.current } : {}),
    };
    setSaveState('saving');
    try {
      const res = await saveEntriesAction(payload);
      if (!res.ok) throw new Error(res.error);
      sendKeys.forEach((k) => dirty.current.delete(k));
      sendRemoved.forEach((k) => removed.current.delete(k));
      if (sendNote) noteDirty.current = false;
      setTimesheetId(res.data.timesheetId);
      if (dirty.current.size === 0 && removed.current.size === 0) await del(draftKey).catch(() => {});
      setSaveState('saved');
      return true;
    } catch {
      setSaveState(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
      clearTimeout(retry.current);
      retry.current = setTimeout(() => void flush(), 5000);
      return false;
    }
  }, [draftKey, view.weekStart]);

  const schedule = useCallback(() => {
    void persistDraft();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  }, [flush, persistDraft]);

  // Restore an unsynced draft from this device, then sync it.
  useEffect(() => {
    let alive = true;
    get<Draft>(draftKey)
      .then((d) => {
        if (!alive || !d || readOnly || (d.dirty.length === 0 && d.removed.length === 0)) return;
        setRows(d.rows.map((r) => ({ ...r, ...label(r) })));
        setNote(d.note);
        d.dirty.forEach((k) => dirty.current.add(k));
        d.removed.forEach((k) => removed.current.add(k));
        noteDirty.current = true;
        void flush();
      })
      .catch(() => {});
    const online = () => void flush();
    const offline = () => setSaveState('offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      alive = false;
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      clearTimeout(timer.current);
      clearTimeout(retry.current);
    };
  }, [draftKey, flush, label, readOnly]);

  // 'Who will approve' refreshes 1.5 s after totals change (workflow.simulate).
  const routeKey = `${totals.total}|${totals.overtime}|${totals.maxDay}|${rows.map((r) => r.projectId).join(',')}`;
  const firstRoute = useRef(true);
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    if (readOnly) return;
    const t = setTimeout(async () => {
      try {
        const res = await previewRouteAction({
          rows: rowsRef.current.map(({ key, projectId, costCodeId, hours }) => ({ key, projectId, costCodeId, hours })),
        });
        if (res.ok) setRoute(res.data);
      } catch {
        /* offline: keep the last route */
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [routeKey, readOnly]);

  // ---------- edits ----------

  function updateRow(i: number, patch: Partial<WeekRow>) {
    setRows((prev) => {
      const next = prev.map((r, j) => (j === i ? { ...r, ...patch } : r));
      const merged = next[i];
      next[i] = { ...merged, ...label(merged) };
      dirty.current.add(merged.key);
      return next;
    });
    schedule();
  }

  function setHours(i: number, d: number, value: number) {
    const hours = [...rows[i].hours];
    hours[d] = value;
    updateRow(i, { hours });
  }

  function addRow() {
    const key = newKey();
    setRows((prev) => [...prev, { key, projectId: null, costCodeId: null, hours: Array(7).fill(0), projectLabel: '', costCodeLabel: '' }]);
    dirty.current.add(key);
    schedule();
  }

  function removeRow(i: number) {
    const key = rows[i].key;
    setRows((prev) => prev.filter((_, j) => j !== i));
    dirty.current.delete(key);
    removed.current.add(key);
    schedule();
  }

  async function copyLastWeek() {
    await flush();
    const res = await copyLastWeekAction({ weekStart: view.weekStart });
    if (!res.ok) return toast(res.error, 'bad');
    toast(res.data.copied ? `Copied ${res.data.copied} rows from last week.` : 'Nothing new to copy from last week.');
    router.refresh();
  }

  async function doSubmit() {
    setConfirm(false);
    setSubmitting(true);
    const saved = await flush();
    if (!saved || !timesheetId) {
      setSubmitting(false);
      return toast(messages.serverError, 'bad');
    }
    const res = await submitAction({ timesheetId, note });
    setSubmitting(false);
    if (!res.ok) return toast(res.error, 'bad');
    if (!res.data.ok) {
      setIssues(res.data.issues.filter((i) => i.level === 'error').map((i) => i.message));
      return;
    }
    setIssues([]);
    await del(draftKey).catch(() => {});
    toast(res.data.message);
    router.refresh();
  }

  // ---------- view ----------

  const savedText: Record<SaveState, string> = {
    idle: '',
    saving: 'Saving...',
    saved: 'Saved',
    offline: messages.offline,
    error: messages.serverError,
  };
  const projectCodes = (pid: string | null) => options.costCodes.filter((c) => c.projectId === pid || c.projectId === null);
  const weekLabel = `Week ${view.weekNumber}`;
  const status = view.timesheet.status;

  const rowEditor = (r: WeekRow, i: number) =>
    readOnly ? (
      <>
        <strong>{r.projectLabel || 'No project'}</strong>
        <span>{r.costCodeLabel || 'No cost code'}</span>
      </>
    ) : (
      <>
        <select
          aria-label="Project"
          value={r.projectId ?? ''}
          onChange={(e) => updateRow(i, { projectId: e.target.value || null, costCodeId: null })}
        >
          <option value="">Choose project</option>
          {options.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Cost code"
          value={r.costCodeId ?? ''}
          onChange={(e) => updateRow(i, { costCodeId: e.target.value || null })}
        >
          <option value="">Choose cost code</option>
          {projectCodes(r.projectId).map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} {c.name}
            </option>
          ))}
        </select>
      </>
    );

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
        {issues.length > 0 && (
          <div className="o-banner bad" role="alert">
            {issues.map((m) => (
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
              {!readOnly && (
                <div className="o-row">
                  <Button onClick={copyLastWeek}>Copy last week</Button>
                  <Button onClick={addRow}>Add row</Button>
                </div>
              )}
            </div>

            {/* Desktop grid */}
            <div className="o-panel flush desk-only" style={{ overflowX: 'auto' }}>
              <WeekGrid
                days={view.days}
                rows={rows.map((r, i) => ({ key: r.key, hours: r.hours, label: rowEditor(r, i) }))}
                rowTotals={totals.rowTotals}
                dayTotals={totals.dayTotals}
                overDays={totals.overDays}
                total={totals.total}
                readOnly={readOnly}
                parse={(t) => parseCell(t, view.rules.stepHours)}
                onChange={setHours}
                onPaste={(i, start, values) => {
                  const hours = [...rows[i].hours];
                  values.forEach((v, k) => (hours[start + k] = v));
                  updateRow(i, { hours });
                }}
                onRemoveRow={removeRow}
                onError={(m) => toast(m, 'bad')}
              />
            </div>
            <div className="o-legend desk-only">
              <span>
                <i style={{ background: 'var(--hatch)' }} />
                Over {view.rules.stdDayHours} h standard day
              </span>
              <span>
                <i style={{ background: '#fafbfa' }} />
                Weekly off ({view.days.filter((d) => d.weeklyOff).map((d) => d.name).join(', ') || 'none'})
              </span>
              <span>Use the arrow keys to move, type to enter hours</span>
            </div>

            {/* Phone: day tabs + stepper */}
            <div className="phone-only">
              <PhoneDayTabs
                days={view.days.map((d, i) => ({ name: d.name, total: totals.dayTotals[i], over: totals.overDays[i], off: d.weeklyOff }))}
                selected={day}
                onSelect={setDay}
              />
              <div className="o-stack" style={{ marginTop: 12 }}>
                {rows.map((r, i) => (
                  <div className="o-panel" key={r.key}>
                    <strong>{r.projectLabel || 'Choose project'}</strong>
                    <div className="muted cond" style={{ fontSize: 12, marginBottom: 8 }}>
                      {r.costCodeLabel || 'Choose cost code'}
                    </div>
                    {(!r.projectId || !r.costCodeId) && !readOnly && <div style={{ marginBottom: 8 }}>{rowEditor(r, i)}</div>}
                    <Stepper value={r.hours[day]} onChange={(v) => setHours(i, day, v)} disabled={readOnly} />
                    {totals.dayTotals[day] > view.rules.stdDayHours && r.hours[day] > 0 && (
                      <div className="hivis" style={{ fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                        {round2(totals.dayTotals[day] - view.rules.stdDayHours).toFixed(1)} h over standard day
                      </div>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <button type="button" className="o-btn block" style={{ borderStyle: 'dashed' }} onClick={addRow}>
                    Add project or cost code
                  </button>
                )}
              </div>
            </div>

            <div className="o-panel desk-only">
              <div className="o-panel-head">
                <h2>Hours by day</h2>
                <span className="muted" style={{ fontSize: 12 }}>
                  Standard {view.rules.stdDayHours} h, overtime hatched
                </span>
              </div>
              <DayBarChart
                days={view.days.map((d, i) => ({ label: d.name, hours: totals.dayTotals[i] }))}
                standard={view.rules.stdDayHours}
              />
            </div>
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
              <div className="o-kv total">
                <span>Total</span>
                <span>{totals.total.toFixed(1)}</span>
              </div>
            </div>

            <div className="o-panel">
              <h2>Who will approve</h2>
              {route
                .filter((s) => s.reason)
                .map((s) => (
                  <p key={s.stepIndex} className="muted" style={{ fontSize: 12, marginTop: -6 }}>
                    {s.reason}: {s.name} also approves.
                  </p>
                ))}
              <ApprovalRoute
                items={route.flatMap((s) =>
                  s.approvers.map((a) => ({ name: a.name, detail: a.title ?? s.name, state: 'next' as const })),
                )}
              />
            </div>

            {!readOnly && (
              <div className="o-panel">
                <label className="o-field">
                  Note for approver (optional)
                  <textarea
                    className="o-textarea"
                    value={note}
                    maxLength={2000}
                    onChange={(e) => {
                      setNote(e.target.value);
                      noteDirty.current = true;
                      schedule();
                    }}
                  />
                </label>
                <div style={{ marginTop: 12 }}>
                  <Button variant="primary" block disabled={submitting || totals.total === 0} onClick={() => setConfirm(true)}>
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
        open={confirm}
        title={`Submit ${weekLabel.toLowerCase()}?`}
        confirmLabel="Submit"
        onConfirm={doSubmit}
        onCancel={() => setConfirm(false)}
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
