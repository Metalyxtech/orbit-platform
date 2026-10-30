import { and, desc, eq, inArray } from 'drizzle-orm';
import { newEvent, type ActionContext, type EmailIntent, type EventMap, type EventType } from '@orbit/core';
import { effectiveRule, type Approver, type ApproverResolver, type MemberRole, type WorkflowDefinition } from '@orbit/core/workflow';
import {
  companyPortals,
  memberships,
  projects,
  tsSettings,
  users,
  workflowDefinitionColumns,
  workflowDefinitions,
  type Queryable,
} from '@orbit/db';

type Tx = Queryable;
import { defaultRules, type TsRules } from '../calc';
import { timesheetManifest } from '../manifest';

export type TsSettingsRow = typeof tsSettings.$inferSelect;

export async function loadSettings(tx: Tx, companyId: string): Promise<Omit<TsSettingsRow, 'companyId'>> {
  const [row] = await tx.select().from(tsSettings).where(eq(tsSettings.companyId, companyId));
  if (row) {
    const { companyId: _c, ...rest } = row;
    return { ...rest, deadlineTime: rest.deadlineTime.slice(0, 5), reminderTime: rest.reminderTime.slice(0, 5) };
  }
  return {
    ...defaultRules,
    deadlineDow: 0,
    deadlineTime: '10:00',
    reminderDow: 6,
    reminderTime: '16:00',
    emailOnApprove: true,
  };
}

export function rulesFrom(s: Awaited<ReturnType<typeof loadSettings>>): TsRules {
  return {
    weekStart: s.weekStart,
    stdDayHours: s.stdDayHours,
    stdWeekHours: s.stdWeekHours,
    weeklyOff: s.weeklyOff,
    overtimeMode: s.overtimeMode,
    noteOverHours: s.noteOverHours,
    stepHours: s.stepHours,
    requireCostCode: s.requireCostCode,
  };
}

export interface MemberInfo {
  membershipId: string;
  name: string;
  email: string;
  title: string | null;
  role: MemberRole;
  supervisorId: string | null;
}

export async function membersById(tx: Tx, ids: string[]): Promise<Map<string, MemberInfo>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({
      membershipId: memberships.id,
      name: users.name,
      email: users.email,
      title: memberships.title,
      role: memberships.role,
      supervisorId: memberships.supervisorId,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(inArray(memberships.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.membershipId, r]));
}

export async function membersWithRole(tx: Tx, companyId: string, role: MemberRole) {
  return tx
    .select({ membershipId: memberships.id, name: users.name, email: users.email, title: memberships.title })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.companyId, companyId), eq(memberships.role, role), eq(memberships.status, 'active')));
}

const toApprover = (m: { membershipId: string; name: string; email: string; title: string | null }): Approver => ({
  membershipId: m.membershipId,
  name: m.name,
  email: m.email,
  title: m.title,
});

/** Turns workflow approver rules into people. Nobody approves their own timesheet. */
export function approverResolver(tx: Tx, companyId: string): ApproverResolver {
  return {
    async resolve(rule, ctx): Promise<Approver[]> {
      if (rule.type === 'matrix') {
        const cell = effectiveRule(rule, ctx);
        return cell ? this.resolve(cell, ctx) : [];
      }
      const submitter = (await membersById(tx, [ctx.submitterId])).get(ctx.submitterId);
      const admins = async () =>
        (await membersWithRole(tx, companyId, 'company_admin'))
          .filter((m) => m.membershipId !== ctx.submitterId)
          .map(toApprover);

      if (rule.type === 'supervisor') {
        if (!submitter?.supervisorId) return admins();
        const sup = (await membersById(tx, [submitter.supervisorId])).get(submitter.supervisorId);
        return sup ? [{ ...toApprover(sup), title: sup.title ?? 'Supervisor' }] : admins();
      }
      if (rule.type === 'project_managers') {
        const ids = ctx.projectIds ?? [];
        if (ids.length === 0) return admins();
        const pms = await tx
          .select({ pmId: projects.pmId, code: projects.code })
          .from(projects)
          .where(and(eq(projects.companyId, companyId), inArray(projects.id, ids)));
        const pmIds = [...new Set(pms.map((p) => p.pmId).filter((id): id is string => !!id && id !== ctx.submitterId))];
        const people = await membersById(tx, pmIds);
        const out = pmIds
          .map((id) => people.get(id))
          .filter((m): m is MemberInfo => !!m)
          .map((m) => ({
            ...toApprover(m),
            title: `Project manager, ${pms.filter((p) => p.pmId === m.membershipId).map((p) => p.code).join(', ')}`,
          }));
        return out.length ? out : admins();
      }
      if (rule.type === 'person') {
        // A named approver who left, was disabled or is the submitter falls back to the admins.
        const [m] = await tx
          .select({ membershipId: memberships.id, name: users.name, email: users.email, title: memberships.title })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(and(eq(memberships.id, rule.membershipId), eq(memberships.companyId, companyId), eq(memberships.status, 'active')));
        return m && m.membershipId !== ctx.submitterId ? [toApprover(m)] : admins();
      }
      const holders = (await membersWithRole(tx, companyId, rule.role)).filter((m) => m.membershipId !== ctx.submitterId);
      return holders.length ? holders.map(toApprover) : admins();
    },
  };
}

/** The workflow bound to the Timesheet portal for this company, or the newest default. */
export async function boundWorkflow(tx: Tx, companyId: string) {
  const [binding] = await tx
    .select({ id: companyPortals.workflowDefinitionId })
    .from(companyPortals)
    .where(and(eq(companyPortals.companyId, companyId), eq(companyPortals.portal, timesheetManifest.id)));
  const where = binding?.id
    ? eq(workflowDefinitions.id, binding.id)
    : eq(workflowDefinitions.key, timesheetManifest.defaultWorkflowKey);
  const [def] = await tx.select(workflowDefinitionColumns).from(workflowDefinitions).where(where).orderBy(desc(workflowDefinitions.version)).limit(1);
  if (!def) throw new Error('No approval workflow is set for the Timesheet portal. Ask Orbit support.');
  return { ...def, definition: def.definition as WorkflowDefinition };
}

export async function loadDefinition(tx: Tx, id: string) {
  const [def] = await tx.select(workflowDefinitionColumns).from(workflowDefinitions).where(eq(workflowDefinitions.id, id));
  return def.definition as WorkflowDefinition;
}

export async function emit<K extends EventType>(tx: Tx, ctx: Pick<ActionContext, 'effects' | 'companyId' | 'companyStage' | 'requestId'>, type: K, data: EventMap[K]) {
  await ctx.effects.emit(
    tx,
    newEvent(type, { companyId: ctx.companyId, companyStage: ctx.companyStage, portal: 'timesheet', requestId: ctx.requestId }, data),
  );
}

export function email(to: (string | undefined)[], template: EmailIntent['template'], props: Record<string, unknown>): EmailIntent {
  return { to: to.filter((t): t is string => !!t), template, props: { baseUrl: process.env.APP_BASE_URL ?? '', ...props } };
}

export function assertRole(ctx: Pick<ActionContext, 'role'>, ...roles: MemberRole[]) {
  if (ctx.role !== 'company_admin' && !roles.includes(ctx.role)) {
    throw new Error('You do not have access to this');
  }
}
