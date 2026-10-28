import { messages } from './messages';

/** Company rules that affect totals and validation (subset of ts_settings). */
export interface TsRules {
  weekStart: number; // 0 = Sunday, 1 = Monday
  stdDayHours: number;
  stdWeekHours: number;
  weeklyOff: number[]; // day of week, 0 = Sunday
  overtimeMode: 'week' | 'day';
  noteOverHours: number;
  stepHours: number;
  requireCostCode: boolean;
}

export const defaultRules: TsRules = {
  weekStart: 0,
  stdDayHours: 9.6,
  stdWeekHours: 48,
  weeklyOff: [5],
  overtimeMode: 'week',
  noteOverHours: 12,
  stepHours: 0.25,
  requireCostCode: true,
};

export interface GridRow {
  key: string;
  projectId: string | null;
  costCodeId: string | null;
  hours: number[]; // 7 values, index 0 = first day of the week
}

export interface WeekTotals {
  dayTotals: number[];
  total: number;
  overtime: number;
  regular: number;
  maxDay: number;
  /** Days above the standard day (hatched hivis fill). */
  overDays: boolean[];
  rowTotals: number[];
}

/** Two decimals, avoiding float drift (acceptance test T1: match server to 0.01 h). */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeTotals(rows: GridRow[], rules: TsRules): WeekTotals {
  const dayTotals = Array.from({ length: 7 }, (_, d) => round2(rows.reduce((s, r) => s + (r.hours[d] ?? 0), 0)));
  const rowTotals = rows.map((r) => round2(r.hours.reduce((s, h) => s + (h ?? 0), 0)));
  const total = round2(dayTotals.reduce((s, h) => s + h, 0));
  const overtime =
    rules.overtimeMode === 'week'
      ? round2(Math.max(0, total - rules.stdWeekHours))
      : round2(dayTotals.reduce((s, h) => s + Math.max(0, h - rules.stdDayHours), 0));
  return {
    dayTotals,
    rowTotals,
    total,
    overtime,
    regular: round2(total - overtime),
    maxDay: Math.max(0, ...dayTotals),
    overDays: dayTotals.map((h) => h > rules.stdDayHours),
  };
}

export type CellResult = { ok: true; value: number } | { ok: false; error: string };

/** Typing replaces the value; it is validated to the step and 0-24 (WeekGrid behaviour). */
export function parseCell(input: string, stepHours: number): CellResult {
  const trimmed = input.trim().replace(',', '.');
  if (trimmed === '' || trimmed === '-') return { ok: true, value: 0 };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Enter hours as a number, e.g. 7.5' };
  if (n > 24) return { ok: false, error: messages.cellOver24 };
  return { ok: true, value: round2(Math.round(n / stepHours) * stepHours) };
}

export interface SubmitIssue {
  level: 'error' | 'warning';
  message: string;
  rowKey?: string;
  day?: number;
}

export function validateSubmit(rows: GridRow[], rules: TsRules, note: string | null | undefined, weekStartDate: string) {
  const issues: SubmitIssue[] = [];
  const totals = computeTotals(rows, rules);

  for (const r of rows) {
    if (!r.projectId || (rules.requireCostCode && !r.costCodeId)) {
      issues.push({ level: 'error', message: messages.missingCostCode, rowKey: r.key });
    }
  }
  totals.dayTotals.forEach((h, d) => {
    if (h > 24) issues.push({ level: 'error', message: messages.cellOver24, day: d });
  });
  if (totals.dayTotals.some((h) => h > rules.noteOverHours) && !note?.trim()) {
    issues.push({ level: 'error', message: messages.noteRequired(rules.noteOverHours) });
  }
  const dates = weekDates(weekStartDate);
  dates.forEach((date, d) => {
    if (rules.weeklyOff.includes(dayOfWeek(date)) && totals.dayTotals[d] > 0) {
      issues.push({ level: 'warning', message: `Hours entered on the weekly off (${dayName(date)}).`, day: d });
    }
  });
  if (totals.total === 0) issues.push({ level: 'error', message: 'Enter some hours before you submit.' });

  // One message per kind is enough for the banner.
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.message + i.level) ? false : (seen.add(i.message + i.level), true)));
}

// ---------- dates (all date-only values are 'YYYY-MM-DD', computed in UTC) ----------

const DAY_MS = 86_400_000;
const parse = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (date: string, n: number) => fmt(new Date(parse(date).getTime() + n * DAY_MS));
export const dayOfWeek = (date: string) => parse(date).getUTCDay();
export const dayName = (date: string, style: 'short' | 'long' = 'short') =>
  parse(date).toLocaleDateString('en-GB', { weekday: style, timeZone: 'UTC' });
export const dayLabel = (date: string) =>
  parse(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function weekDates(weekStart: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** First day of the week that contains `date`. */
export function weekStartFor(date: string, weekStartDow: number) {
  const diff = (dayOfWeek(date) - weekStartDow + 7) % 7;
  return addDays(date, -diff);
}

/** ISO week number of the Thursday inside the week ("Week 44"). */
export function weekNumber(weekStart: string) {
  const thursday = weekDates(weekStart).find((d) => dayOfWeek(d) === 4)!;
  const t = parse(thursday);
  const jan1 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.floor((t.getTime() - jan1) / DAY_MS / 7) + 1;
}

/** Deadline date: the first `deadlineDow` on or after the last day of the week. */
export function deadlineDate(weekStart: string, deadlineDow: number) {
  const end = addDays(weekStart, 6);
  return addDays(end, (deadlineDow - dayOfWeek(end) + 7) % 7);
}

export function weekRangeLabel(weekStart: string) {
  return `${dayLabel(weekStart)} to ${dayLabel(addDays(weekStart, 6))}`;
}
