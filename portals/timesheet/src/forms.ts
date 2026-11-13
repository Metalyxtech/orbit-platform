import type { SessionContext } from '@orbit/core';

/**
 * Timesheet entry forms the company admin can choose from, per role. To add a form: add it
 * here, add its component in screens/forms/registry.tsx, and give it a preview there.
 */
export const TIMESHEET_FORMS = [
  {
    id: 'weekly-grid',
    name: 'Weekly grid',
    summary: 'One row per project and cost code, one column per day.',
    bestFor: 'Office and site staff who work on the same jobs all week.',
    points: ['Whole week at a glance', 'Keyboard and paste friendly', 'Daily totals and overtime per column'],
  },
  {
    id: 'daily-log',
    name: 'Day by day',
    summary: 'One card per day; add a line for each job worked that day.',
    bestFor: 'Supervisors and people who move between jobs each day.',
    points: ['Fill in one day at a time', 'Only the jobs worked that day', 'Day totals and overtime on each card'],
  },
] as const;

export type TimesheetFormId = (typeof TIMESHEET_FORMS)[number]['id'];
export const DEFAULT_FORM: TimesheetFormId = 'weekly-grid';
export const isFormId = (v: string): v is TimesheetFormId => TIMESHEET_FORMS.some((f) => f.id === v);

/** Roles the admin chooses a form for, in display order. */
export const FORM_ROLES: { role: SessionContext['role']; label: string; detail: string }[] = [
  { role: 'employee', label: 'Employees', detail: 'Everyone without a team' },
  { role: 'supervisor', label: 'Supervisors', detail: 'Team leads who also approve' },
  { role: 'project_manager', label: 'Project managers', detail: 'Approve for their projects' },
  { role: 'management', label: 'Management', detail: 'GM, CEO and directors' },
  { role: 'company_admin', label: 'Company admins', detail: 'People who run the company account' },
];
