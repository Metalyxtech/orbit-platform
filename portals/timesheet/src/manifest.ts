import type { PortalManifest } from '@orbit/core/portals';

const days = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

/** Portal module 1: Timesheet. Settings keys match ts_settings columns (camelCase). */
export const timesheetManifest: PortalManifest = {
  id: 'timesheet',
  name: 'Timesheet',
  workflowKind: 'timesheet.submit',
  defaultWorkflowKey: 'timesheet.two_level_overtime',
  nav: [
    { path: 'dashboard', label: 'Dashboard', section: 'main', roles: ['supervisor', 'project_manager', 'company_admin'] },
    { path: '', label: 'My week', section: 'main' },
    { path: 'history', label: 'My history', section: 'main' },
    {
      path: 'approvals',
      label: 'Approvals',
      section: 'main',
      roles: ['supervisor', 'project_manager', 'company_admin'],
      badge: 'approvals',
    },
    { path: 'team', label: 'Team overview', section: 'main', roles: ['supervisor', 'project_manager', 'company_admin'] },
    { path: 'reports', label: 'Reports', section: 'main', roles: ['project_manager', 'company_admin'] },
    { path: 'admin/users', label: 'Users', section: 'admin', roles: ['company_admin'] },
    { path: 'admin/workflow', label: 'Approval workflow', section: 'admin', roles: ['company_admin'] },
    { path: 'admin/projects', label: 'Projects and cost codes', section: 'admin', roles: ['company_admin'] },
    { path: 'admin/settings', label: 'Timesheet settings', section: 'admin', roles: ['company_admin'] },
  ],
  settingsSchema: {
    groups: [
      {
        title: 'Working week',
        fields: [
          {
            key: 'weekStart',
            label: 'Week starts on',
            type: 'segmented',
            options: [
              { value: 0, label: 'Sunday' },
              { value: 1, label: 'Monday' },
            ],
          },
          { key: 'stdDayHours', label: 'Standard hours per day', type: 'number', min: 1, max: 24, step: 0.1 },
          { key: 'stdWeekHours', label: 'Standard hours per week', type: 'number', min: 1, max: 168, step: 0.5 },
          { key: 'weeklyOff', label: 'Weekly off', type: 'select', options: days, multiple: true },
        ],
      },
      {
        title: 'Overtime',
        fields: [
          {
            key: 'overtimeMode',
            label: 'Count overtime by',
            type: 'segmented',
            options: [
              { value: 'week', label: 'Week total above standard' },
              { value: 'day', label: 'Each day above standard' },
            ],
          },
          { key: 'noteOverHours', label: 'Note required when a day exceeds', type: 'number', min: 1, max: 24, step: 0.5, unit: 'h' },
          {
            key: 'stepHours',
            label: 'Hours entered in steps of',
            type: 'select',
            options: [
              { value: 0.25, label: '0.25 h' },
              { value: 0.5, label: '0.5 h' },
              { value: 1, label: '1 h' },
            ],
          },
        ],
      },
      {
        title: 'Deadline and reminders',
        fields: [
          { key: 'deadlineDow', label: 'Submit by (day)', type: 'select', options: days },
          { key: 'deadlineTime', label: 'Submit by (time)', type: 'time' },
          { key: 'reminderDow', label: 'Reminder to people not submitted (day)', type: 'select', options: days },
          { key: 'reminderTime', label: 'Reminder time', type: 'time' },
          { key: 'requireCostCode', label: 'Every row needs a project and a cost code', type: 'toggle' },
          { key: 'emailOnApprove', label: 'Email the employee when a week is approved', type: 'toggle' },
        ],
      },
    ],
  },
};

/** Default workflow: "Two-level with overtime check" (seeded into the workflow library). */
export const twoLevelOvertimeWorkflow = {
  key: 'timesheet.two_level_overtime',
  name: 'Two-level with overtime check',
  description:
    'Supervisor, then project manager when overtime is above 6.0 h or a day is above 12 h.',
  definition: {
    steps: [
      { id: 'supervisor', name: 'Supervisor', approver: { type: 'supervisor' }, slaHours: 24, remindAfterHours: 16 },
      {
        id: 'pm',
        name: 'Project managers',
        approver: { type: 'project_managers' },
        when: {
          any: [
            { field: 'overtimeHours', op: 'gt', value: 6 },
            { field: 'maxDayHours', op: 'gt', value: 12 },
          ],
        },
        reason: 'Because overtime > 6.0 h',
        slaHours: 24,
        remindAfterHours: 16,
      },
    ],
  },
} as const;
