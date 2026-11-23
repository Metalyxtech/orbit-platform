import type { SessionContext } from '@orbit/core';
import { managementModules } from './modules';
import type { Workspace } from './types';

/** The workspace for GM, CEO, directors (role "management") and company admins. */
const standard: Workspace = {
  id: 'standard',
  title: 'Management',
  roles: ['management', 'company_admin'],
  modules: managementModules,
};

/**
 * Workspace layouts by id. To give a company its own: add a layout here, for example
 *   acme: { ...standard, id: 'acme', title: 'Directors', modules: { timesheet: acmeTimesheet } },
 * then map the company to it in COMPANY_WORKSPACE below.
 */
export const workspaces: Record<string, Workspace> = { standard };

/** Company id -> workspace id. Companies not listed use "standard". */
const COMPANY_WORKSPACE: Record<string, string> = {};

export function workspaceFor(ctx: Pick<SessionContext, 'companyId'>): Workspace {
  return workspaces[COMPANY_WORKSPACE[ctx.companyId] ?? 'standard'] ?? standard;
}

/** True when this person gets the full Management workspace. */
export function isManager(ctx: Pick<SessionContext, 'companyId' | 'role'>): boolean {
  return workspaceFor(ctx).roles.includes(ctx.role);
}
