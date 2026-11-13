-- Timesheet approval flows a company admin can choose from (Timesheet settings).
-- Supervisors come from each person's Supervisor field; project managers from each project's PM.
INSERT INTO workflow_definitions (key, version, name, description, definition) VALUES
(
  'timesheet.supervisor_only', 1, 'Supervisor only',
  'The employee''s supervisor approves. One step.',
  '{"steps":[{"id":"supervisor","name":"Supervisor","approver":{"type":"supervisor"},"slaHours":24,"remindAfterHours":16}]}'
),
(
  'timesheet.supervisor_then_pm', 1, 'Supervisor, then project managers',
  'The supervisor approves, then the project managers of every project on the timesheet.',
  '{"steps":[{"id":"supervisor","name":"Supervisor","approver":{"type":"supervisor"},"slaHours":24,"remindAfterHours":16},{"id":"pm","name":"Project managers","approver":{"type":"project_managers"},"slaHours":24,"remindAfterHours":16}]}'
),
(
  'timesheet.supervisor_then_admin', 1, 'Supervisor, then company admin',
  'The supervisor approves, then any company admin gives the final approval.',
  '{"steps":[{"id":"supervisor","name":"Supervisor","approver":{"type":"supervisor"},"slaHours":24,"remindAfterHours":16},{"id":"admin","name":"Company admin","approver":{"type":"role","role":"company_admin"},"slaHours":24,"remindAfterHours":16}]}'
),
(
  'timesheet.pm_only', 1, 'Project managers only',
  'The project managers of every project on the timesheet approve. No supervisor step.',
  '{"steps":[{"id":"pm","name":"Project managers","approver":{"type":"project_managers"},"slaHours":24,"remindAfterHours":16}]}'
),
(
  'timesheet.three_level', 1, 'Supervisor, project managers, then company admin',
  'Three steps: the supervisor, the project managers, then any company admin.',
  '{"steps":[{"id":"supervisor","name":"Supervisor","approver":{"type":"supervisor"},"slaHours":24,"remindAfterHours":16},{"id":"pm","name":"Project managers","approver":{"type":"project_managers"},"slaHours":24,"remindAfterHours":16},{"id":"admin","name":"Company admin","approver":{"type":"role","role":"company_admin"},"slaHours":24,"remindAfterHours":16}]}'
)
ON CONFLICT (key, version) DO NOTHING;
