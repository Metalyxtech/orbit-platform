export type MemberRole = 'employee' | 'supervisor' | 'project_manager' | 'company_admin';

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { field: string; op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'; value: number };

export type ApproverRule =
  | { type: 'supervisor' } // the submitter's supervisor
  | { type: 'project_managers' } // every PM of the projects in the context (all must approve)
  | { type: 'role'; role: MemberRole }; // any one member with the role

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
