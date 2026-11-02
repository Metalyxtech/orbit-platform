import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { timesheets, type Tx } from '@orbit/db';
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

/**
 * The Timesheet portal's contribution to the Management workspace overview. Other portals expose a
 * function with the same shape; the workspace renders one section per portal.
 */
export async function executiveSummary(tx: Tx, ctx: SessionContext) {
  const month = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone }).slice(0, 7);
  const [k, trend, byProject, levels, byApprover, top] = await Promise.all([
    kpis(tx, ctx, { month }),
    weeklyTrend(tx, ctx),
    hoursByProject(tx, ctx, { month }),
    approvalsByLevel(tx, ctx),
    waitingByApprover(tx, ctx),
    topOvertime(tx, ctx, { month }),
  ]);
  return { month, kpis: k, trend, byProject, levels, byApprover, top };
}
