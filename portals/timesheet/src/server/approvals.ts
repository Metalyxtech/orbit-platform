import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext, SessionContext } from '@orbit/core';
import { decideTask, nextStepIndex, WorkflowConflictError, type Decision, type WorkflowContext } from '@orbit/core/workflow';
import {
  costCodes,
  memberships,
  projects,
  timesheetEntries,
  timesheets,
  users,
  workflowInstances,
  workflowTasks,
  type Tx,
} from '@orbit/db';
import { weekNumber, weekRangeLabel } from '../calc';
import { approverResolver, email, emit, loadDefinition, loadSettings, membersById } from './shared';

export interface InboxRow {
  taskId: string;
  timesheetId: string;
  employee: string;
  employeeTitle: string | null;
  initials: string;
  week: number;
  total: number;
  overtime: number;
  submittedAt: string | null;
  dueAt: string | null;
  overdue: boolean;
  resubmitted: boolean;
  stepLabel: string;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** approvals.mine: my pending tasks, overdue first. */
export async function mine(tx: Tx, ctx: SessionContext): Promise<InboxRow[]> {
  const rows = await tx
    .select({
      taskId: workflowTasks.id,
      dueAt: workflowTasks.dueAt,
      stepIndex: workflowTasks.stepIndex,
      instanceId: workflowTasks.instanceId,
      timesheetId: timesheets.id,
      weekStart: timesheets.weekStart,
      total: timesheets.totalHours,
      overtime: timesheets.overtimeHours,
      submittedAt: timesheets.submittedAt,
      returnedAt: timesheets.returnedAt,
      employee: users.name,
      employeeTitle: memberships.title,
    })
    .from(workflowTasks)
    .innerJoin(workflowInstances, eq(workflowInstances.id, workflowTasks.instanceId))
    .innerJoin(timesheets, eq(timesheets.id, workflowInstances.subjectId))
    .innerJoin(memberships, eq(memberships.id, timesheets.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(workflowTasks.assigneeId, ctx.membershipId), eq(workflowTasks.status, 'pending')))
    .orderBy(asc(workflowTasks.dueAt));

  const now = Date.now();
  return rows
    .map((r) => ({
      taskId: r.taskId,
      timesheetId: r.timesheetId,
      employee: r.employee,
      employeeTitle: r.employeeTitle,
      initials: initials(r.employee),
      week: weekNumber(r.weekStart),
      total: r.total,
      overtime: r.overtime,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      dueAt: r.dueAt?.toISOString() ?? null,
      overdue: !!r.dueAt && r.dueAt.getTime() < now,
      resubmitted: !!r.returnedAt,
      stepLabel: `Step ${r.stepIndex + 1}`,
    }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue));
}

export async function countMine(tx: Tx, ctx: SessionContext) {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(workflowTasks)
    .where(and(eq(workflowTasks.assigneeId, ctx.membershipId), eq(workflowTasks.status, 'pending')));
  return n;
}

/** Detail panel: lines by project / cost code, note, route. */
export async function taskDetail(tx: Tx, ctx: SessionContext, input: { taskId: string }) {
  const [task] = await tx.select().from(workflowTasks).where(eq(workflowTasks.id, input.taskId));
  if (!task) throw new Error('Task not found');
  const [instance] = await tx.select().from(workflowInstances).where(eq(workflowInstances.id, task.instanceId));
  const [sheet] = await tx.select().from(timesheets).where(eq(timesheets.id, instance.subjectId));
  const employee = (await membersById(tx, [sheet.membershipId])).get(sheet.membershipId)!;
  // Only the assignee, the employee's supervisor chain and admins look at this.
  if (task.assigneeId !== ctx.membershipId && ctx.role !== 'company_admin') throw new Error('Task not found');

  const lines = await tx
    .select({
      project: projects.code,
      costCode: costCodes.code,
      costName: costCodes.name,
      hours: sql<number>`sum(${timesheetEntries.hours})::float`,
    })
    .from(timesheetEntries)
    .leftJoin(projects, eq(projects.id, timesheetEntries.projectId))
    .leftJoin(costCodes, eq(costCodes.id, timesheetEntries.costCodeId))
    .where(eq(timesheetEntries.timesheetId, sheet.id))
    .groupBy(projects.code, costCodes.code, costCodes.name)
    .orderBy(asc(projects.code));

  const allTasks = await tx.select().from(workflowTasks).where(eq(workflowTasks.instanceId, instance.id));
  const people = await membersById(tx, allTasks.map((t) => t.assigneeId));
  const settings = await loadSettings(tx, ctx.companyId);
  // Steps of this instance's own workflow version that apply to this timesheet.
  const def = await loadDefinition(tx, instance.definitionId);
  const wfCtx = instance.context as WorkflowContext;
  const applies: number[] = [];
  for (let i = nextStepIndex(def, wfCtx, 0); i !== -1; i = nextStepIndex(def, wfCtx, i + 1)) applies.push(i);
  const position = Math.max(1, applies.indexOf(task.stepIndex) + 1);
  const next = def.steps[applies[applies.indexOf(task.stepIndex) + 1]];
  const overDay = sheet.maxDayHours > settings.noteOverHours;

  return {
    taskId: task.id,
    status: task.status,
    employee: employee.name,
    initials: initials(employee.name),
    week: weekNumber(sheet.weekStart),
    rangeLabel: weekRangeLabel(sheet.weekStart),
    stepLabel: `Step ${position} of ${Math.max(applies.length, position)}`,
    lines: lines.map((l) => ({ label: `${l.project ?? 'No project'}, ${l.costCode ?? ''} ${l.costName ?? ''}`.trim(), hours: l.hours })),
    total: sheet.totalHours,
    overtime: sheet.overtimeHours,
    note: sheet.note,
    warning: next
      ? `${overDay ? `A day has ${sheet.maxDayHours} h. ` : ''}After you approve, the week goes to ${next.name}${next.reason ? ` (${next.reason.toLowerCase()})` : ''}.`
      : null,
    route: allTasks
      .sort((a, b) => a.stepIndex - b.stepIndex)
      .map((t) => ({ step: t.stepName, name: people.get(t.assigneeId)?.name ?? '', status: t.status, dueAt: t.dueAt?.toISOString() ?? null })),
  };
}

const decideInput = z.object({
  taskId: z.uuid(),
  action: z.enum(['approve', 'return', 'reject']),
  comment: z.string().max(2000).optional(),
  expectedStatus: z.literal('pending').default('pending'),
});

/** approvals.decide: workflow.decide plus the Timesheet side effects; emails go out through the outbox. */
export async function decide(tx: Tx, ctx: ActionContext, raw: z.input<typeof decideInput>) {
  const input = decideInput.parse(raw);
  const result = await decideTask(
    tx,
    {
      taskId: input.taskId,
      action: input.action as Decision,
      comment: input.comment,
      actorMembershipId: ctx.membershipId,
      expectedStatus: input.expectedStatus,
    },
    (id) => loadDefinition(tx, id),
    approverResolver(tx, ctx.companyId),
  );
  ctx.effects.timersToDelete.push(...result.closedTaskIds);

  const [sheet] = await tx.select().from(timesheets).where(eq(timesheets.id, result.instance.subjectId));
  const employee = (await membersById(tx, [sheet.membershipId])).get(sheet.membershipId)!;
  const week = weekNumber(sheet.weekStart);
  const now = new Date();

  if (result.instance.status === 'approved') {
    await tx.update(timesheets).set({ status: 'locked', approvedAt: now, lockedAt: now }).where(eq(timesheets.id, sheet.id));
    const settings = await loadSettings(tx, ctx.companyId);
    await emit(tx, ctx, 'timesheet.approved', {
      timesheetId: sheet.id,
      email: settings.emailOnApprove
        ? email([employee.email], 'timesheet_approved', { employeeName: employee.name, week, approverName: ctx.name, path: '/timesheet/history' })
        : undefined,
    });
  } else if (result.instance.status === 'returned' || result.instance.status === 'rejected') {
    const returned = result.instance.status === 'returned';
    await tx
      .update(timesheets)
      .set({ status: returned ? 'returned' : 'rejected', returnComment: input.comment, returnedBy: ctx.name, returnedAt: now })
      .where(eq(timesheets.id, sheet.id));
    await emit(tx, ctx, returned ? 'timesheet.returned' : 'timesheet.rejected', {
      timesheetId: sheet.id,
      email: email([employee.email], returned ? 'timesheet_returned' : 'timesheet_rejected', {
        employeeName: employee.name,
        week,
        approverName: ctx.name,
        comment: input.comment,
        path: '/timesheet',
      }),
    });
  }

  for (const task of result.createdTasks) {
    ctx.effects.timersToCreate.push(task);
    await emit(tx, ctx, 'approval.task_created', {
      taskId: task.id,
      email: email([task.approver.email], 'task_created', {
        approverName: task.approver.name,
        employeeName: employee.name,
        week,
        totalHours: sheet.totalHours,
        overtimeHours: sheet.overtimeHours,
        dueAt: task.dueAt?.toISOString(),
        path: '/timesheet/approvals',
      }),
    });
  }
  return { status: result.instance.status, task: result.task.status };
}

/** approvals.decideBulk: approve only; limited to timesheets without overtime. */
export async function decideBulk(
  tx: Tx,
  ctx: ActionContext,
  input: { taskIds: string[] },
): Promise<{ approved: number; skipped: number }> {
  const ids = z.array(z.uuid()).max(100).parse(input.taskIds);
  const rows = await tx
    .select({ taskId: workflowTasks.id, overtime: timesheets.overtimeHours })
    .from(workflowTasks)
    .innerJoin(workflowInstances, eq(workflowInstances.id, workflowTasks.instanceId))
    .innerJoin(timesheets, eq(timesheets.id, workflowInstances.subjectId))
    .where(inArray(workflowTasks.id, ids));
  let approved = 0;
  let skipped = 0;
  for (const r of rows) {
    if (r.overtime > 0) {
      skipped++;
      continue;
    }
    try {
      await decide(tx, ctx, { taskId: r.taskId, action: 'approve' });
      approved++;
    } catch (err) {
      if (err instanceof WorkflowConflictError) skipped++;
      else throw err;
    }
  }
  return { approved, skipped };
}

