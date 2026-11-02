import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { memberships, timesheetEntries, timesheets, users, type Tx } from '@orbit/db';
import { addDays, weekNumber, weekStartFor } from '../calc';
import { approvalsByLevel, hoursByProject, kpis, topOvertime, waitingByApprover } from './reports';
import { loadSettings } from './shared';

/** Submitted and approved hours per week for the last `weeks` weeks, company-wide. */
export async function weeklyTrend(tx: Tx, ctx: SessionContext, weeks = 8) {
  const settings = await loadSettings(tx, ctx.companyId);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone });
  const current = weekStartFor(today, settings.weekStart);
  const starts = Array.from({ length: weeks }, (_, i) => addDays(current, -7 * (weeks - 1 - i)));
  const rows = await tx
    .select({
      weekStart: timesheets.weekStart,
      total: sql<number>`coalesce(sum(${timesheets.totalHours}), 0)::float`,
      overtime: sql<number>`coalesce(sum(${timesheets.overtimeHours}), 0)::float`,
    })
    .from(timesheets)
    .where(and(gte(timesheets.weekStart, starts[0]), inArray(timesheets.status, ['in_approval', 'locked']), eq(timesheets.companyId, ctx.companyId)))
    .groupBy(timesheets.weekStart);
  return starts.map((w) => {
    const r = rows.find((x) => x.weekStart === w);
    return { label: `W${weekNumber(w)}`, regular: Math.max(0, (r?.total ?? 0) - (r?.overtime ?? 0)), overtime: r?.overtime ?? 0 };
  });
}

export type Period = 'week' | 'month';

/** Hours per person in this week or this month (submitted and approved timesheets), for the pie chart. */
export async function hoursByPersonFor(tx: Tx, ctx: SessionContext, period: Period) {
  const settings = await loadSettings(tx, ctx.companyId);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone });
  const start = period === 'week' ? weekStartFor(today, settings.weekStart) : `${today.slice(0, 7)}-01`;
  const [y, m] = today.slice(0, 7).split('-').map(Number);
  const end = period === 'week' ? addDays(start, 7) : new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const rows = await tx
    .select({
      name: users.name,
      title: memberships.title,
      hours: sql<number>`sum(${timesheetEntries.hours})::float`,
    })
    .from(timesheetEntries)
    .innerJoin(timesheets, eq(timesheets.id, timesheetEntries.timesheetId))
    .innerJoin(memberships, eq(memberships.id, timesheets.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(timesheets.companyId, ctx.companyId),
        inArray(timesheets.status, ['in_approval', 'locked']),
        gte(timesheetEntries.workDate, start),
        lt(timesheetEntries.workDate, end),
      ),
    )
    .groupBy(users.name, memberships.title)
    .orderBy(desc(sql`sum(${timesheetEntries.hours})`));
  const label =
    period === 'week'
      ? `Week ${weekNumber(start)}`
      : new Date(`${start}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { label, rows: rows.map((r) => ({ ...r, hours: Math.round(r.hours * 10) / 10 })) };
}

/**
 * The Timesheet portal's contribution to the Management workspace overview. Other portals expose a
 * function with the same shape; the workspace renders one section per portal.
 */
export async function executiveSummary(tx: Tx, ctx: SessionContext, period: Period = 'month') {
  const month = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone }).slice(0, 7);
  const [k, trend, byProject, levels, byApprover, top, people] = await Promise.all([
    kpis(tx, ctx, { month }),
    weeklyTrend(tx, ctx),
    hoursByProject(tx, ctx, { month }),
    approvalsByLevel(tx, ctx),
    waitingByApprover(tx, ctx),
    topOvertime(tx, ctx, { month }),
    hoursByPersonFor(tx, ctx, period),
  ]);
  return { month, kpis: k, trend, byProject, levels, byApprover, top, people, period };
}
