'use client';
import { DEFAULT_FORM, type TimesheetFormId } from '../forms';
import type { WeekView } from '../server/week';
import { formComponents } from './forms/registry';

/** My week: shows the entry form the company admin chose for this person's role. */
export function MyWeekClient({ view, draftKey, formId = DEFAULT_FORM }: { view: WeekView; draftKey: string; formId?: TimesheetFormId }) {
  const { Form } = formComponents[formId] ?? formComponents[DEFAULT_FORM];
  return <Form view={view} draftKey={draftKey} />;
}
