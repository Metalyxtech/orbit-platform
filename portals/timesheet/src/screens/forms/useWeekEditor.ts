'use client';
import { del, get, set } from 'idb-keyval';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RouteStep } from '@orbit/core/workflow';
import { useToast } from '@orbit/ui';
import { copyLastWeekAction, previewRouteAction, saveEntriesAction, submitAction } from '../../actions';
import { computeTotals, type GridRow } from '../../calc';
import { messages } from '../../messages';
import type { WeekRow, WeekView } from '../../server/week';

export type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

interface Draft {
  rows: GridRow[];
  removed: string[];
  note: string;
  dirty: string[];
}

export const newKey = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Everything a timesheet entry form needs, whatever it looks like: rows, totals, autosave
 * (800 ms idle, IndexedDB copy for offline), the approval route preview and submit.
 * Forms only render; they change data through the functions returned here.
 */
export function useWeekEditor(view: WeekView, draftKey: string) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<WeekRow[]>(view.rows);
  const [note, setNoteState] = useState(view.timesheet.note ?? '');
  const [timesheetId, setTimesheetId] = useState(view.timesheet.id);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [route, setRoute] = useState<RouteStep[]>(view.route);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);

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

  // ---------- autosave ----------

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
        setNoteState(d.note);
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

  /** Adds an empty row (optionally with project, cost code and hours) and returns its key. */
  function addRow(init?: Partial<Pick<WeekRow, 'projectId' | 'costCodeId' | 'hours'>>) {
    const key = newKey();
    const base: WeekRow = { key, projectId: null, costCodeId: null, hours: Array(7).fill(0), projectLabel: '', costCodeLabel: '' };
    const row = { ...base, ...init };
    setRows((prev) => [...prev, { ...row, ...label(row) }]);
    dirty.current.add(key);
    schedule();
    return key;
  }

  function removeRow(i: number) {
    const key = rows[i].key;
    setRows((prev) => prev.filter((_, j) => j !== i));
    dirty.current.delete(key);
    removed.current.add(key);
    schedule();
  }

  function setNote(v: string) {
    setNoteState(v);
    noteDirty.current = true;
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

  const projectCodes = (pid: string | null) => options.costCodes.filter((c) => c.projectId === pid || c.projectId === null);

  return {
    view,
    rows,
    totals,
    note,
    readOnly,
    saveState,
    route,
    issues,
    confirm,
    submitting,
    options,
    projectCodes,
    toast,
    setConfirm,
    setNote,
    updateRow,
    setHours,
    addRow,
    removeRow,
    copyLastWeek,
    doSubmit,
  };
}

export type WeekEditor = ReturnType<typeof useWeekEditor>;
