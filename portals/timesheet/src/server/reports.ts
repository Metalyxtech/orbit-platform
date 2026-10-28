import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext, SessionContext } from '@orbit/core';
import {
  exports as exportsTable,
  memberships,
  projects,
  timesheetEntries,
  timesheets,
  users,
  workflowTasks,
  type Tx,
} from '@orbit/db';
import { deadlineDate } from '../calc';
import { assertRole, emit, loadSettings } from './shared';

const filterSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  projectIds: z.array(z.uuid()).optional(),
});
export type ReportFilter = z.infer<typeof filterSchema>;

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { start, end };
}

/** Projects the caller may report on: all for admins, the ones they manage for PMs. */
async function visibleProjects(tx: Tx, ctx: SessionContext, requested?: string[]) {
  const rows = await tx
    .select({ id: projects.id, code: projects.code, name: projects.name, pmId: projects.pmId })
    .from(projects)
    .where(eq(projects.companyId, ctx.companyId))
    .orderBy(asc(projects.code));
  const allowed = ctx.role === 'company_admin' ? rows : rows.filter((p) => p.pmId === ctx.membershipId);
  return requested?.length ? allowed.filter((p) => requested.includes(p.id)) : allowed;
}

/** Hours by project: approved + locked data only, overtime allocated in proportion to each week's hours. */
export async function hoursByProject(tx: Tx, ctx: SessionContext, raw: ReportFilter) {
  assertRole(ctx, 'project_manager');
  const f = filterSchema.parse(raw);
  const { start, end } = monthRange(f.month);
  const projs = await visibleProjects(tx, ctx, f.projectIds);
  if (projs.length === 0) return [];
  const rows = await tx
    .select({
      projectId: timesheetEntries.projectId,
      hours: sql<number>`coalesce(sum(${timesheetEntries.hours}), 0)::float`,
      overtime: sql<number>`coalesce(sum(${timesheetEntries.hours} * ${timesheets.overtimeHours} / nullif(${timesheets.totalHours}, 0)), 0)::float`,
    })
    .from(timesheetEntries)
    .innerJoin(timesheets, eq(timesheets.id, timesheetEntries.timesheetId))
    .where(
      and(
        eq(timesheets.status, 'locked'),
        gte(timesheetEntries.workDate, start),
        lt(timesheetEntries.workDate, end),
        inArray(timesheetEntries.projectId, projs.map((p) => p.id)),
      ),
    )
    .groupBy(timesheetEntries.projectId);
  return projs
    .map((p) => {
      const r = rows.find((x) => x.projectId === p.id);
      const hours = Math.round((r?.hours ?? 0) * 100) / 100;
      const overtime = Math.round((r?.overtime ?? 0) * 100) / 100;
      return { projectId: p.id, label: `${p.code} ${p.name}`, hours, overtime, regular: Math.round((hours - overtime) * 100) / 100 };
    })
    .filter((p) => p.hours > 0)
    .sort((a, b) => b.hours - a.hours);
}

export async function kpis(tx: Tx, ctx: SessionContext, raw: ReportFilter) {
  const f = filterSchema.parse(raw);
  const byProject = await hoursByProject(tx, ctx, f);
  const approved = byProject.reduce((s, p) => s + p.hours, 0);
  const overtime = byProject.reduce((s, p) => s + p.overtime, 0);

  const { start, end } = monthRange(f.month);
  const settings = await loadSettings(tx, ctx.companyId);
  const weeks = await tx
    .select({ weekStart: timesheets.weekStart, submittedAt: timesheets.submittedAt, status: timesheets.status })
    .from(timesheets)
    .where(and(gte(timesheets.weekStart, start), lt(timesheets.weekStart, end), eq(timesheets.revision, 0)));
  const submitted = weeks.filter((w) => w.submittedAt);
  const onTime = submitted.filter((w) => {
    const d = deadlineDate(w.weekStart, settings.deadlineDow);
    // Deadline time is in the company time zone; compare on the local date + time string.
    const local = w.submittedAt!.toLocaleString('sv-SE', { timeZone: ctx.timezone }).slice(0, 16);
    return local <= `${d} ${settings.deadlineTime}`;
  });
  const [{ waiting }] = await tx
    .select({ waiting: sql<number>`count(*)::int` })
    .from(timesheets)
    .where(eq(timesheets.status, 'in_approval'));

  return {
    approvedHours: Math.round(approved * 10) / 10,
    overtimeHours: Math.round(overtime * 10) / 10,
    overtimePct: approved ? Math.round((overtime / approved) * 1000) / 10 : 0,
    onTimePct: weeks.length ? Math.round((onTime.length / weeks.length) * 100) : 0,
    waiting,
  };
}

/** Waiting by approver: pending tasks per person with the oldest age in hours. */
export async function waitingByApprover(tx: Tx, ctx: SessionContext) {
  assertRole(ctx, 'project_manager', 'supervisor');
  const rows = await tx
    .select({
      name: users.name,
      role: memberships.role,
      title: memberships.title,
      waiting: sql<number>`count(*)::int`,
      oldest: sql<string>`min(${workflowTasks.createdAt})`,
    })
    .from(workflowTasks)
    .innerJoin(memberships, eq(memberships.id, workflowTasks.assigneeId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(workflowTasks.status, 'pending'))
    .groupBy(users.name, memberships.role, memberships.title)
    .orderBy(desc(sql`count(*)`));
  return rows.map((r) => ({
    name: r.name,
    title: r.title ?? r.role.replace('_', ' '),
    waiting: r.waiting,
    oldestHours: Math.round((Date.now() - new Date(r.oldest).getTime()) / 3_600_000),
  }));
}

export async function topOvertime(tx: Tx, ctx: SessionContext, raw: ReportFilter) {
  assertRole(ctx, 'project_manager');
  const { start, end } = monthRange(filterSchema.parse(raw).month);
  return tx
    .select({ name: users.name, overtime: sql<number>`sum(${timesheets.overtimeHours})::float` })
    .from(timesheets)
    .innerJoin(memberships, eq(memberships.id, timesheets.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(timesheets.status, 'locked'), gte(timesheets.weekStart, start), lt(timesheets.weekStart, end)))
    .groupBy(users.name)
    .having(sql`sum(${timesheets.overtimeHours}) > 0`)
    .orderBy(desc(sql`sum(${timesheets.overtimeHours})`))
    .limit(5);
}

/** reports.export: outbox event report.export_requested -> exporter Lambda -> email with a 24 h link. */
export async function requestExport(tx: Tx, ctx: ActionContext, raw: ReportFilter & { report?: string }) {
  assertRole(ctx, 'project_manager');
  const f = filterSchema.parse(raw);
  const projs = await visibleProjects(tx, ctx, f.projectIds);
  const report = raw.report ?? 'hoursByProject';
  const [row] = await tx
    .insert(exportsTable)
    .values({ companyId: ctx.companyId, requestedBy: ctx.membershipId, report })
    .returning();
  await emit(tx, ctx, 'report.export_requested', {
    exportId: row.id,
    report,
    filters: { month: f.month, projectIds: projs.map((p) => p.id) },
    notifyEmail: ctx.email,
  });
  return { exportId: row.id };
}

export async function reportProjects(tx: Tx, ctx: SessionContext) {
  return (await visibleProjects(tx, ctx)).map((p) => ({ id: p.id, label: `${p.code} ${p.name}` }));
}
