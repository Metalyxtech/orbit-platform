import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { hrLeaveRequests, hrLeaveTypes, timesheetEntries, timesheets, tsHolidays, tsSettings, type Queryable } from '@orbit/db';

// The link between HR and Timesheet, kept in core so neither portal imports the other.
//  - Timesheet asks for approved leave, to show it on My week and the roster.
//  - HR asks for the hours people booked, the holidays and the weekly off, to build attendance.
// Every read falls back to "nothing" while a portal's tables are not there yet.

const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
const missing = (err: unknown) => pgCode(err) === '42P01' || /relation "(hr_\w+|ts_\w+|timesheet\w*)" does not exist/.test(String(err));
async function safe<T>(tx: Queryable, fn: (sp: Queryable) => Promise<T>, fallback: T): Promise<T> {
  try {
    return await tx.transaction((sp) => fn(sp as unknown as Queryable));
  } catch (err) {
    if (missing(err)) return fallback;
    throw err;
  }
}

const DAY = 86_400_000;
/** Every 'YYYY-MM-DD' from `from` to `to`, inclusive. */
export function datesBetween(from: string, to: string) {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export interface LeaveDay {
  type: string;
  code: string;
  paid: boolean;
  halfDay: boolean;
}

/** Approved leave per person per day (membershipId -> date -> leave), within from..to. */
export async function approvedLeave(tx: Queryable, companyId: string, ids: string[], from: string, to: string) {
  const out = new Map<string, Map<string, LeaveDay>>();
  if (!ids.length) return out;
  const rows = await safe(
    tx,
    (sp) =>
      sp
        .select({ membershipId: hrLeaveRequests.membershipId, fromDate: hrLeaveRequests.fromDate, toDate: hrLeaveRequests.toDate, halfDay: hrLeaveRequests.halfDay, type: hrLeaveTypes.name, code: hrLeaveTypes.code, paid: hrLeaveTypes.paid })
        .from(hrLeaveRequests)
        .innerJoin(hrLeaveTypes, eq(hrLeaveTypes.id, hrLeaveRequests.leaveTypeId))
        .where(and(eq(hrLeaveRequests.companyId, companyId), inArray(hrLeaveRequests.membershipId, ids), eq(hrLeaveRequests.status, 'approved'), lte(hrLeaveRequests.fromDate, to), gte(hrLeaveRequests.toDate, from))),
    [] as { membershipId: string; fromDate: string; toDate: string; halfDay: boolean; type: string; code: string; paid: boolean }[],
  );
  for (const r of rows) {
    const days = out.get(r.membershipId) ?? new Map<string, LeaveDay>();
    for (const d of datesBetween(r.fromDate < from ? from : r.fromDate, r.toDate > to ? to : r.toDate)) days.set(d, { type: r.type, code: r.code, paid: r.paid, halfDay: r.halfDay });
    out.set(r.membershipId, days);
  }
  return out;
}

/**
 * What attendance is built from, for some people over some dates: hours booked per day (latest
 * revision of each week's timesheet), approved leave, public holidays and the weekly off days.
 */
export async function attendanceFacts(tx: Queryable, companyId: string, ids: string[], from: string, to: string) {
  const hours = new Map<string, Map<string, number>>();
  if (ids.length) {
    const rows = await safe(
      tx,
      (sp) =>
        sp
          .select({ membershipId: timesheets.membershipId, weekStart: timesheets.weekStart, revision: timesheets.revision, workDate: timesheetEntries.workDate, hours: timesheetEntries.hours })
          .from(timesheetEntries)
          .innerJoin(timesheets, eq(timesheets.id, timesheetEntries.timesheetId))
          .where(and(eq(timesheets.companyId, companyId), inArray(timesheets.membershipId, ids), gte(timesheetEntries.workDate, from), lte(timesheetEntries.workDate, to))),
      [] as { membershipId: string; weekStart: string; revision: number; workDate: string; hours: number }[],
    );
    // Only the latest revision of each person's week counts.
    const latest = new Map<string, number>();
    for (const r of rows) latest.set(`${r.membershipId}:${r.weekStart}`, Math.max(latest.get(`${r.membershipId}:${r.weekStart}`) ?? 0, r.revision));
    for (const r of rows) {
      if (r.revision !== latest.get(`${r.membershipId}:${r.weekStart}`)) continue;
      const m = hours.get(r.membershipId) ?? new Map<string, number>();
      m.set(r.workDate, Math.round(((m.get(r.workDate) ?? 0) + r.hours) * 100) / 100);
      hours.set(r.membershipId, m);
    }
  }
  const [holidays, settings, leave] = await Promise.all([
    safe(tx, (sp) => sp.select({ date: tsHolidays.holidayDate, name: tsHolidays.name }).from(tsHolidays).where(and(eq(tsHolidays.companyId, companyId), gte(tsHolidays.holidayDate, from), lte(tsHolidays.holidayDate, to))), [] as { date: string; name: string }[]),
    safe(tx, (sp) => sp.select({ weeklyOff: tsSettings.weeklyOff }).from(tsSettings).where(eq(tsSettings.companyId, companyId)), [] as { weeklyOff: number[] }[]),
    approvedLeave(tx, companyId, ids, from, to),
  ]);
  return { hours, leave, holidays: new Map(holidays.map((h) => [h.date, h.name])), weeklyOff: settings[0]?.weeklyOff ?? [5] };
}

export type AttendanceMark = 'P' | 'HD' | 'L' | 'HL' | 'H' | 'WO' | 'A' | '-';

/**
 * One day's mark: Present (hours booked), Half day (under half the standard day), Leave, Half-day
 * leave, Holiday, Weekly off, Absent (a past working day with nothing), '-' (future or before joining).
 */
export function markFor(o: { hours: number; leave?: LeaveDay; holiday?: string; weeklyOff: boolean; future: boolean; stdDayHours: number }): AttendanceMark {
  if (o.leave && !o.leave.halfDay) return 'L';
  if (o.hours > 0) return o.leave?.halfDay ? 'HL' : o.hours < o.stdDayHours / 2 ? 'HD' : 'P';
  if (o.leave?.halfDay) return 'HL';
  if (o.holiday) return 'H';
  if (o.weeklyOff) return 'WO';
  return o.future ? '-' : 'A';
}
