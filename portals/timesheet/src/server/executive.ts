import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { alias } from 'drizzle-orm/pg-core';
import { memberships, timesheetEntries, timesheets, users, workflowInstances, workflowTasks, type Tx } from '@orbit/db';
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

export const STATUSES = ['draft', 'returned', 'in_approval', 'locked'] as const;
type Status = (typeof STATUSES)[number];

/**
 * Hours per person in this week or this month, split by timesheet status: draft (not submitted),
 * returned (sent back), in approval and approved. Rejected timesheets are left out.
 */
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
      status: timesheets.status,
      hours: sql<number>`sum(${timesheetEntries.hours})::float`,
    })
    .from(timesheetEntries)
    .innerJoin(timesheets, eq(timesheets.id, timesheetEntries.timesheetId))
    .innerJoin(memberships, eq(memberships.id, timesheets.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(timesheets.companyId, ctx.companyId),
        inArray(timesheets.status, [...STATUSES]),
        gte(timesheetEntries.workDate, start),
        lt(timesheetEntries.workDate, end),
      ),
    )
    .groupBy(users.name, memberships.title, timesheets.status);
  const people = new Map<string, { name: string; title: string | null; byStatus: Record<Status, number>; hours: number }>();
  for (const r of rows) {
    const p = people.get(r.name) ?? { name: r.name, title: r.title, byStatus: { draft: 0, returned: 0, in_approval: 0, locked: 0 }, hours: 0 };
    const h = Math.round(r.hours * 10) / 10;
    p.byStatus[r.status as Status] += h;
    p.hours += h;
    people.set(r.name, p);
  }
  const list = [...people.values()].sort((a, b) => b.hours - a.hours);
  const totals = STATUSES.reduce((o, st) => ({ ...o, [st]: list.reduce((n, p) => n + p.byStatus[st], 0) }), {} as Record<Status, number>);
  const label =
    period === 'week'
      ? `Week ${weekNumber(start)}`
      : new Date(`${start}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { label, rows: list, totals };
}

/** Every approval waiting right now: who must approve, for whom, at which level and for how long. */
export async function pendingApprovals(tx: Tx, ctx: SessionContext) {
  const assignee = alias(memberships, 'assignee');
  const assigneeUser = alias(users, 'assignee_user');
  const rows = await tx
    .select({
      taskId: workflowTasks.id,
      level: workflowTasks.stepName,
      createdAt: workflowTasks.createdAt,
      dueAt: workflowTasks.dueAt,
      approver: assigneeUser.name,
      approverTitle: assignee.title,
      employee: users.name,
      weekStart: timesheets.weekStart,
      hours: timesheets.totalHours,
    })
    .from(workflowTasks)
    .innerJoin(workflowInstances, eq(workflowInstances.id, workflowTasks.instanceId))
    .innerJoin(timesheets, eq(timesheets.id, workflowInstances.subjectId))
    .innerJoin(memberships, eq(memberships.id, timesheets.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(assignee, eq(assignee.id, workflowTasks.assigneeId))
    .innerJoin(assigneeUser, eq(assigneeUser.id, assignee.userId))
    .where(and(eq(workflowTasks.companyId, ctx.companyId), eq(workflowTasks.status, 'pending')))
    .orderBy(workflowTasks.createdAt);
  const now = Date.now();
  const list = rows.map((r) => ({
    ...r,
    week: weekNumber(r.weekStart),
    waitingHours: Math.max(0, Math.round((now - r.createdAt.getTime()) / 3_600_000)),
    overdue: !!r.dueAt && r.dueAt.getTime() < now,
  }));
  const buckets = [
    { label: 'Under 1 day', test: (h: number) => h < 24 },
    { label: '1 to 2 days', test: (h: number) => h >= 24 && h < 48 },
    { label: '2 to 5 days', test: (h: number) => h >= 48 && h < 120 },
    { label: 'Over 5 days', test: (h: number) => h >= 120 },
  ].map((b) => {
    const inB = list.filter((r) => b.test(r.waitingHours));
    return { label: b.label, onTime: inB.filter((r) => !r.overdue).length, overdue: inB.filter((r) => r.overdue).length };
  });
  const approvers = new Map<string, { label: string; detail?: string; onTime: number; overdue: number; oldest: number }>();
  for (const r of list) {
    const a = approvers.get(r.approver) ?? { label: r.approver, detail: r.approverTitle ?? undefined, onTime: 0, overdue: 0, oldest: 0 };
    if (r.overdue) a.overdue++;
    else a.onTime++;
    a.oldest = Math.max(a.oldest, r.waitingHours);
    approvers.set(r.approver, a);
  }
  return { list, buckets, approvers: [...approvers.values()].sort((a, b) => b.overdue + b.onTime - (a.overdue + a.onTime)) };
}

/**
 * The Timesheet portal's contribution to the Management workspace overview. Other portals expose a
 * function with the same shape; the workspace renders one section per portal.
 */
export async function executiveSummary(tx: Tx, ctx: SessionContext, period: Period = 'month') {
  const month = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone }).slice(0, 7);
  const [k, trend, byProject, levels, byApprover, top, people, pending] = await Promise.all([
    kpis(tx, ctx, { month }),
    weeklyTrend(tx, ctx),
    hoursByProject(tx, ctx, { month }),
    approvalsByLevel(tx, ctx),
    waitingByApprover(tx, ctx),
    topOvertime(tx, ctx, { month }),
    hoursByPersonFor(tx, ctx, period),
    pendingApprovals(tx, ctx),
  ]);
  return { month, kpis: k, trend, byProject, levels, byApprover, top, people, pending, period };
}
