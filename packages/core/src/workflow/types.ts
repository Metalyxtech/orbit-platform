export type MemberRole = 'employee' | 'supervisor' | 'project_manager' | 'company_admin' | 'management';

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { field: string; op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'; value: number }
  /** Who submitted: lets a matrix level apply only to some employees. Ids are membership ids. */
  | { submitter: 'in' | 'notIn'; ids: string[] };

export type ApproverRule =
  | { type: 'supervisor' } // the submitter's supervisor
  | { type: 'project_managers' } // every PM of the projects in the context (all must approve)
  | { type: 'role'; role: MemberRole } // any one member with the role
  | { type: 'person'; membershipId: string } // one named member of the company
  /** Approval matrix level: a rule per submitting employee (membership id), '*' for everyone else. */
  | { type: 'matrix'; cells: Record<string, CellRule> };

/** A matrix cell: any rule except another matrix. */
export type CellRule = Exclude<ApproverRule, { type: 'matrix' }>;

/** The rule that applies to this submitter: a matrix level resolves to the submitter's cell. */
export function effectiveRule(rule: ApproverRule, ctx: Pick<WorkflowContext, 'submitterId'>): CellRule | null {
  if (rule.type !== 'matrix') return rule;
  return rule.cells[ctx.submitterId] ?? rule.cells['*'] ?? null;
}

export interface StepDef {
  id: string;
  name: string;
  approver: ApproverRule;
  /** Step runs only when the condition holds. */
  when?: Condition;
  /** Shown in "Who will approve" when the step is conditional, e.g. "Because overtime > 6.0 h". */
  reason?: string;
  slaHours: number;
  remindAfterHours?: number;
}

export interface WorkflowDefinition {
  steps: StepDef[];
}

/** Values a definition can test. Portals put their own numbers in here. */
export interface WorkflowContext {
  submitterId: string; // membership id
  projectIds?: string[];
  [field: string]: unknown;
}

export interface Approver {
  membershipId: string;
  name: string;
  title?: string | null;
  email?: string;
}

export interface RouteStep {
  stepIndex: number;
  name: string;
  reason?: string;
  approvers: Approver[];
}

export type Decision = 'approve' | 'return' | 'reject';

export interface ApproverResolver {
  resolve(rule: ApproverRule, ctx: WorkflowContext): Promise<Approver[]>;
}

export class WorkflowConflictError extends Error {
  constructor(message = 'This task was already decided') {
    super(message);
    this.name = 'WorkflowConflictError';
  }
}
