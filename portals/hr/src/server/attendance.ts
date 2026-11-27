import { eq } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { attendanceFacts, datesBetween, markFor, type AttendanceMark } from '@orbit/core/attendance';
import { hrEmployees, tsSettings, type Tx } from '@orbit/db';
import { visiblePeople } from './shared';

// Attendance for a month, worked out (never typed in): hours booked in Timesheet, leave approved in
// HR, public holidays and the weekly off. One letter per person per day, with monthly totals.

/** Attendance grid for the people I see, for one month ('YYYY-MM'). */
export async function monthAttendance(tx: Tx, ctx: SessionContext, raw: { month?: string }) {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone });
  const month = raw.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw.month) ? raw.month : todayStr.slice(0, 7);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const days = datesBetween(first, last);
  const { people, everyone } = await visiblePeople(tx, ctx);
  const ids = people.map((p) => p.membershipId);
  const facts = await attendanceFacts(tx, ctx.companyId, ids, first, last);
  const [settings] = await tx.select({ std: tsSettings.stdDayHours }).from(tsSettings).where(eq(tsSettings.companyId, ctx.companyId)).catch(() => [] as { std: number }[]);
  const stdDayHours = settings?.std ?? 8;
  const records = await tx
    .select({ membershipId: hrEmployees.membershipId, joiningDate: hrEmployees.joiningDate, code: hrEmployees.employeeCode })
    .from(hrEmployees)
    .where(eq(hrEmployees.companyId, ctx.companyId))
    .catch(() => [] as { membershipId: string; joiningDate: string | null; code: string | null }[]);
  const joined = new Map(records.map((r) => [r.membershipId, r]));
  const rows = people.map((p) => {
    const marks: AttendanceMark[] = days.map((date) => {
      const j = joined.get(p.membershipId)?.joiningDate;
      if (j && date < j) return '-';
      return markFor({
        hours: facts.hours.get(p.membershipId)?.get(date) ?? 0,
        leave: facts.leave.get(p.membershipId)?.get(date),
        holiday: facts.holidays.get(date),
        weeklyOff: facts.weeklyOff.includes(new Date(`${date}T00:00:00Z`).getUTCDay()),
        future: date > todayStr,
        stdDayHours,
      });
    });
    const count = (m: AttendanceMark[]) => marks.filter((x) => m.includes(x)).length;
    const hours = [...(facts.hours.get(p.membershipId)?.values() ?? [])].reduce((s, h) => s + h, 0);
    return {
      membershipId: p.membershipId,
      name: p.name,
      code: joined.get(p.membershipId)?.code ?? null,
      marks,
      present: count(['P']) + count(['HD', 'HL']) * 0.5,
      leave: count(['L']) + count(['HL']) * 0.5,
      absent: count(['A']),
      hours: Math.round(hours * 10) / 10,
    };
  });
  return {
    month,
    days: days.map((d) => ({ date: d, day: Number(d.slice(8)), dow: new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' }), holiday: facts.holidays.get(d) ?? null })),
    rows,
    everyone,
  };
}
export type AttendanceView = Awaited<ReturnType<typeof monthAttendance>>;
