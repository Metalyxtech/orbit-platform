import type { CompanyStage } from './events';
import type { Effects } from './effects';
import type { MemberRole } from './workflow/types';

/** Everything a server action knows about the caller, resolved by the auth guard. */
export interface SessionContext {
  requestId: string;
  userId: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  companyId: string;
  companyName: string;
  companyStage: CompanyStage;
  timezone: string;
  membershipId: string;
  role: MemberRole;
  title: string | null;
}

export interface ActionContext extends SessionContext {
  effects: Effects;
}

const RANK: Record<MemberRole, number> = { employee: 0, supervisor: 1, project_manager: 2, company_admin: 3 };

export function hasRole(ctx: Pick<SessionContext, 'role'>, ...roles: MemberRole[]) {
  return roles.includes(ctx.role) || ctx.role === 'company_admin';
}

export function atLeast(ctx: Pick<SessionContext, 'role'>, role: MemberRole) {
  return RANK[ctx.role] >= RANK[role];
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have access to this') {
    super(message);
    this.name = 'ForbiddenError';
  }
}
