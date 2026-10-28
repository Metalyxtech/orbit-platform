import {
  ActionAfterCompletion,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  FlexibleTimeWindowMode,
  ResourceNotFoundException,
  UpdateScheduleCommand,
  ConflictException,
} from '@aws-sdk/client-scheduler';
import { schedulerClient } from './aws/clients';

/** Payload the escalator Lambda forwards to POST /api/internal/timer (Section 6.2). */
export type TimerPayload =
  | { kind: 'remind'; taskId: string; companyId: string }
  | { kind: 'sla'; taskId: string; companyId: string }
  | { kind: 'ts_deadline_reminder'; companyId: string };

function target(payload: TimerPayload) {
  const arn = process.env.APP_SCHEDULER_TARGET_ARN;
  const roleArn = process.env.APP_SCHEDULER_ROLE_ARN;
  if (!arn || !roleArn) throw new Error('APP_SCHEDULER_TARGET_ARN / APP_SCHEDULER_ROLE_ARN not set');
  return {
    Arn: arn,
    RoleArn: roleArn,
    Input: JSON.stringify(payload),
    RetryPolicy: { MaximumRetryAttempts: 5 },
    ...(process.env.APP_SCHEDULER_DLQ_ARN
      ? { DeadLetterConfig: { Arn: process.env.APP_SCHEDULER_DLQ_ARN } }
      : {}),
  };
}

const group = () => process.env.APP_SCHEDULER_GROUP ?? 'default';
const at = (d: Date) => `at(${d.toISOString().slice(0, 19)})`;

async function upsert(name: string, expression: string, payload: TimerPayload, timezone = 'UTC', oneTime = true) {
  const input = {
    Name: name,
    GroupName: group(),
    ScheduleExpression: expression,
    ScheduleExpressionTimezone: timezone,
    FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF },
    Target: target(payload),
    ...(oneTime ? { ActionAfterCompletion: ActionAfterCompletion.DELETE } : {}),
  };
  try {
    await schedulerClient().send(new CreateScheduleCommand(input));
  } catch (err) {
    if (err instanceof ConflictException) await schedulerClient().send(new UpdateScheduleCommand(input));
    else throw err;
  }
}

async function remove(name: string) {
  try {
    await schedulerClient().send(new DeleteScheduleCommand({ Name: name, GroupName: group() }));
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
  }
}

export async function createTaskTimers(task: {
  id: string;
  companyId: string;
  dueAt: Date | null;
  remindAt: Date | null;
}) {
  const now = Date.now();
  if (task.remindAt && task.remindAt.getTime() > now) {
    await upsert(`task-${task.id}-remind`, at(task.remindAt), {
      kind: 'remind',
      taskId: task.id,
      companyId: task.companyId,
    });
  }
  if (task.dueAt && task.dueAt.getTime() > now) {
    await upsert(`task-${task.id}-sla`, at(task.dueAt), {
      kind: 'sla',
      taskId: task.id,
      companyId: task.companyId,
    });
  }
}

/** When a task is decided early the app deletes both schedules (acceptance test I4). */
export async function deleteTaskTimers(taskId: string) {
  await Promise.all([remove(`task-${taskId}-remind`), remove(`task-${taskId}-sla`)]);
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Recurring weekly reminder in the company time zone, e.g. cron(0 16 ? * SAT *). */
export async function upsertWeeklyReminder(companyId: string, dow: number, time: string, timezone: string) {
  const [h, m] = time.split(':').map(Number);
  await upsert(
    `co-${companyId}-ts-reminder`,
    `cron(${m} ${h} ? * ${DOW[dow]} *)`,
    { kind: 'ts_deadline_reminder', companyId },
    timezone,
    false,
  );
}

export async function deleteWeeklyReminder(companyId: string) {
  await remove(`co-${companyId}-ts-reminder`);
}
