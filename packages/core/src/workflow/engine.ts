import { and, eq, ne, sql } from 'drizzle-orm';
import { workflowInstances, workflowTasks, type Tx } from '@orbit/db';
import { nextStepIndex } from './simulate';
import {
  WorkflowConflictError,
  type Approver,
  type ApproverResolver,
  type Decision,
  type WorkflowContext,
  type WorkflowDefinition,
} from './types';

type TaskRow = typeof workflowTasks.$inferSelect;
type InstanceRow = typeof workflowInstances.$inferSelect;

export interface StartInput {
  companyId: string;
  kind: string; // 'timesheet.submit'
  subjectId: string;
  definitionId: string;
  definition: WorkflowDefinition;
  context: WorkflowContext;
  now?: Date;
}

export interface EngineResult {
  instance: InstanceRow;
  /** Tasks created by this call: notify assignees and create timers after commit. */
  createdTasks: (TaskRow & { approver: Approver })[];
  /** Tasks closed by this call: delete their timers after commit. */
  closedTaskIds: string[];
}

const HOUR = 3_600_000;

async function createStepTasks(
  tx: Tx,
  instance: InstanceRow,
  def: WorkflowDefinition,
  stepIndex: number,
  resolver: ApproverResolver,
  now: Date,
) {
  const step = def.steps[stepIndex];
  const approvers = await resolver.resolve(step.approver, instance.context as WorkflowContext);
  if (approvers.length === 0) throw new Error(`No approver found for step "${step.name}"`);
  // A role step needs only one of the role holders; supervisor / PM steps need every approver.
  const assignees = step.approver.type === 'role' ? approvers.slice(0, 1) : approvers;

  const created: EngineResult['createdTasks'] = [];
  for (const approver of assignees) {
    const [task] = await tx
      .insert(workflowTasks)
      .values({
        companyId: instance.companyId,
        instanceId: instance.id,
        stepIndex,
        stepName: step.name,
        assigneeId: approver.membershipId,
        dueAt: new Date(now.getTime() + step.slaHours * HOUR),
        remindAt: step.remindAfterHours
          ? new Date(now.getTime() + step.remindAfterHours * HOUR)
          : null,
      })
      .returning();
    created.push({ ...task, approver });
  }
  return created;
}

/** workflow.start: creates the instance and the first step's tasks inside the caller's transaction. */
export async function startWorkflow(
  tx: Tx,
  input: StartInput,
  resolver: ApproverResolver,
): Promise<EngineResult> {
  const now = input.now ?? new Date();
  const first = nextStepIndex(input.definition, input.context, 0);
  if (first === -1) throw new Error('Workflow has no applicable steps');

  const [instance] = await tx
    .insert(workflowInstances)
    .values({
      companyId: input.companyId,
      definitionId: input.definitionId,
      kind: input.kind,
      subjectId: input.subjectId,
      currentStep: first,
      context: input.context,
    })
    .returning();

  const createdTasks = await createStepTasks(tx, instance, input.definition, first, resolver, now);
  return { instance, createdTasks, closedTaskIds: [] };
}

export interface DecideInput {
  taskId: string;
  action: Decision;
  actorMembershipId: string;
  comment?: string;
  /** Optimistic check so a double click cannot approve twice. */
  expectedStatus?: 'pending';
  now?: Date;
}

/** workflow.decide: records one approver's decision and advances or closes the instance. */
export async function decideTask(
  tx: Tx,
  input: DecideInput,
  loadDefinition: (definitionId: string) => Promise<WorkflowDefinition>,
  resolver: ApproverResolver,
): Promise<EngineResult & { task: TaskRow }> {
  const now = input.now ?? new Date();
  if ((input.action === 'return' || input.action === 'reject') && !input.comment?.trim()) {
    throw new Error('A comment is required to return or reject');
  }

  const [task] = await tx
    .select()
    .from(workflowTasks)
    .where(eq(workflowTasks.id, input.taskId))
    .for('update');
  if (!task) throw new Error('Task not found');
  if (task.status !== (input.expectedStatus ?? 'pending')) throw new WorkflowConflictError();
  if (task.assigneeId !== input.actorMembershipId) throw new Error('This task is not assigned to you');

  const statusFor = { approve: 'approved', return: 'returned', reject: 'rejected' } as const;
  const [decided] = await tx
    .update(workflowTasks)
    .set({
      status: statusFor[input.action],
      decidedAt: now,
      decidedBy: input.actorMembershipId,
      comment: input.comment ?? null,
    })
    .where(and(eq(workflowTasks.id, task.id), eq(workflowTasks.status, 'pending')))
    .returning();
  if (!decided) throw new WorkflowConflictError();

  const [instance] = await tx
    .select()
    .from(workflowInstances)
    .where(eq(workflowInstances.id, task.instanceId))
    .for('update');
  const closedTaskIds = [task.id];

  if (input.action !== 'approve') {
    const cancelled = await tx
      .update(workflowTasks)
      .set({ status: 'cancelled', decidedAt: now })
      .where(and(eq(workflowTasks.instanceId, instance.id), eq(workflowTasks.status, 'pending')))
      .returning({ id: workflowTasks.id });
    closedTaskIds.push(...cancelled.map((c) => c.id));
    const [updated] = await tx
      .update(workflowInstances)
      .set({ status: statusFor[input.action], completedAt: now })
      .where(eq(workflowInstances.id, instance.id))
      .returning();
    return { task: decided, instance: updated, createdTasks: [], closedTaskIds };
  }

  // Approve: wait for the other approvers of this step, if any.
  const [{ open }] = await tx
    .select({ open: sql<number>`count(*)::int` })
    .from(workflowTasks)
    .where(
      and(
        eq(workflowTasks.instanceId, instance.id),
        eq(workflowTasks.stepIndex, task.stepIndex),
        eq(workflowTasks.status, 'pending'),
        ne(workflowTasks.id, task.id),
      ),
    );
  if (open > 0) return { task: decided, instance, createdTasks: [], closedTaskIds };

  const def = await loadDefinition(instance.definitionId);
  const next = nextStepIndex(def, instance.context as WorkflowContext, task.stepIndex + 1);
  if (next === -1) {
    const [updated] = await tx
      .update(workflowInstances)
      .set({ status: 'approved', completedAt: now })
      .where(eq(workflowInstances.id, instance.id))
      .returning();
    return { task: decided, instance: updated, createdTasks: [], closedTaskIds };
  }

  const [updated] = await tx
    .update(workflowInstances)
    .set({ currentStep: next })
    .where(eq(workflowInstances.id, instance.id))
    .returning();
  const createdTasks = await createStepTasks(tx, updated, def, next, resolver, now);
  return { task: decided, instance: updated, createdTasks, closedTaskIds };
}
