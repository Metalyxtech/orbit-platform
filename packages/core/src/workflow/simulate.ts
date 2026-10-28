import type { ApproverResolver, Condition, RouteStep, WorkflowContext, WorkflowDefinition } from './types';

export function evaluate(cond: Condition | undefined, ctx: WorkflowContext): boolean {
  if (!cond) return true;
  if ('all' in cond) return cond.all.every((c) => evaluate(c, ctx));
  if ('any' in cond) return cond.any.some((c) => evaluate(c, ctx));
  const v = Number(ctx[cond.field] ?? 0);
  switch (cond.op) {
    case 'gt':
      return v > cond.value;
    case 'gte':
      return v >= cond.value;
    case 'lt':
      return v < cond.value;
    case 'lte':
      return v <= cond.value;
    case 'eq':
      return v === cond.value;
  }
}

/** Index of the next step at or after `from` whose condition holds, or -1. */
export function nextStepIndex(def: WorkflowDefinition, ctx: WorkflowContext, from: number) {
  for (let i = from; i < def.steps.length; i++) {
    if (evaluate(def.steps[i].when, ctx)) return i;
  }
  return -1;
}

/** workflow.simulate: the route a submission would take, without writing anything. */
export async function simulate(
  def: WorkflowDefinition,
  ctx: WorkflowContext,
  resolver: ApproverResolver,
): Promise<RouteStep[]> {
  const route: RouteStep[] = [];
  for (let i = nextStepIndex(def, ctx, 0); i !== -1; i = nextStepIndex(def, ctx, i + 1)) {
    const step = def.steps[i];
    route.push({
      stepIndex: i,
      name: step.name,
      reason: step.when ? step.reason : undefined,
      approvers: await resolver.resolve(step.approver, ctx),
    });
  }
  return route;
}
