import { and, eq, inArray } from 'drizzle-orm';
import type { ActionContext, TimerPayload } from '@orbit/core';
import { memberships, timesheets, users, workflowInstances, workflowTasks, type Tx } from '@orbit/db';
import { addDays, deadlineDate, weekNumber, weekStartFor } from '../calc';
import { email, emit, loadSettings, membersById, membersWithRole } from './shared';

/**
 * Called by POST /api/internal/timer (escalator Lambda, HMAC signed).
 * Every branch re-checks state, so a late or repeated timer is harmless.
 */
export async function handleTimer(tx: Tx, ctx: ActionContext, payload: TimerPayload) {
  if (payload.kind === 'ts_deadline_reminder') {
    const settings = await loadSettings(tx, ctx.companyId);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone });
    // Remind for the week whose deadline comes next: the previous week while its deadline is still ahead.
    const current = weekStartFor(today, settings.weekStart);
    const previous = addDays(current, -7);
    const weekStart = deadlineDate(previous, settings.deadlineDow) >= today ? previous : current;
    const people = await tx
      .select({ membershipId: memberships.id, email: users.email, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.status, 'active')));
    const done = await tx
      .select({ membershipId: timesheets.membershipId })
      .from(timesheets)
      .where(and(eq(timesheets.weekStart, weekStart), inArray(timesheets.status, ['in_approval', 'locked'])));
    const doneIds = new Set(done.map((d) => d.membershipId));
    const missing = people.filter((p) => !doneIds.has(p.membershipId));
    for (const p of missing) {
      await emit(tx, ctx, 'timesheet.deadline_reminder', {
        email: email([p.email], 'ts_deadline_reminder', {
          employeeName: p.name,
          week: weekNumber(weekStart),
          deadline: `${settings.deadlineTime}`,
          path: '/timesheet',
        }),
      });
    }
    return { reminded: missing.length };
  }

  const [task] = await tx.select().from(workflowTasks).where(eq(workflowTasks.id, payload.taskId));
  if (!task || task.status !== 'pending') return { skipped: true };
  const [instance] = await tx.select().from(workflowInstances).where(eq(workflowInstances.id, task.instanceId));
  const [sheet] = await tx.select().from(timesheets).where(eq(timesheets.id, instance.subjectId));
  const people = await membersById(tx, [task.assigneeId, sheet.membershipId]);
  const approver = people.get(task.assigneeId)!;
  const employee = people.get(sheet.membershipId)!;

  const overdue = payload.kind === 'sla';
  // SLA breach: the approver and the company admins hear about it.
  const cc = overdue ? (await membersWithRole(tx, ctx.companyId, 'company_admin')).map((a) => a.email) : [];
  await emit(tx, ctx, 'approval.task_reminder', {
    taskId: task.id,
    email: email([approver.email, ...cc.filter((e) => e !== approver.email)], 'task_reminder', {
      approverName: approver.name,
      employeeName: employee.name,
      week: weekNumber(sheet.weekStart),
      overdue,
      dueAt: task.dueAt?.toISOString(),
      path: '/timesheet/approvals',
    }),
  });
  return { reminded: 1 };
}
