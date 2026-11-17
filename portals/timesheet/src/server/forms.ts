import { z } from 'zod';
import { audit, readFormChoices, writeFormChoice, type ActionContext, type SessionContext } from '@orbit/core';
import type { Tx } from '@orbit/db';
import { DEFAULT_FORM, FORM_ROLES, isFormId, TIMESHEET_FORMS, type TimesheetFormId } from '../forms';
import { assertRole } from './shared';

const PORTAL = 'timesheet';

/** The entry form this person uses (their role's choice, or the default). */
export async function formFor(tx: Tx, ctx: SessionContext): Promise<TimesheetFormId> {
  const choice = (await readFormChoices(tx, ctx.companyId, PORTAL))[ctx.role];
  return choice && isFormId(choice) ? choice : DEFAULT_FORM;
}

/** Admin > Timesheet forms: every role with the form it uses now. */
export async function listFormChoices(tx: Tx, ctx: SessionContext) {
  assertRole(ctx, 'company_admin');
  const choices = await readFormChoices(tx, ctx.companyId, PORTAL);
  return {
    forms: TIMESHEET_FORMS.map((f) => ({ ...f, points: [...f.points] })),
    roles: FORM_ROLES.map((r) => {
      const c = choices[r.role];
      return { ...r, formId: c && isFormId(c) ? c : DEFAULT_FORM };
    }),
  };
}

const choiceInput = z.object({
  role: z.enum(FORM_ROLES.map((r) => r.role) as [string, ...string[]]),
  formId: z.string().refine(isFormId, 'Choose one of the forms'),
});

export async function setFormChoice(tx: Tx, ctx: ActionContext, raw: z.input<typeof choiceInput>) {
  assertRole(ctx, 'company_admin');
  const input = choiceInput.parse(raw);
  const ok = await writeFormChoice(tx, { companyId: ctx.companyId, portal: PORTAL, role: input.role, formId: input.formId, updatedBy: ctx.membershipId });
  if (!ok) throw new Error('Form choices switch on after the latest database update.');
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'timesheet.form', entity: 'portal_forms', entityId: ctx.companyId, data: input, requestId: ctx.requestId });
  return { role: input.role, formId: input.formId };
}
