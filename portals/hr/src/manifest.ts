import type { PortalManifest } from '@orbit/core/portals';
import { HR_ROLES } from './config';

const ALL = HR_ROLES.map((r) => r.id);
const STAFF = ['hr', 'admin'];

/**
 * Portal module: HR. Employee records, leave with approval, and attendance built from Timesheet,
 * approved leave and the holiday calendar. Leave approvers are the person's supervisor, HR or admin.
 */
export const hrManifest: PortalManifest = {
  id: 'hr',
  name: 'HR',
  workflowKind: 'hr.leave',
  defaultWorkflowKey: 'hr.leave_single',
  nav: [
    { path: '', label: 'My HR', section: 'main', portalRoles: ALL },
    { path: 'leave', label: 'Leave approvals', section: 'main', badge: 'approvals', portalRoles: ALL },
    { path: 'attendance', label: 'Attendance', section: 'main', portalRoles: ALL },
    { path: 'employees', label: 'Employees', section: 'main', portalRoles: STAFF },
    { path: 'admin/settings', label: 'HR settings', section: 'admin', roles: ['company_admin'] },
  ],
  settingsSchema: { groups: [] },
  portalRoles: HR_ROLES as unknown as NonNullable<PortalManifest['portalRoles']>,
  defaultPortalRole: (role) => (role === 'company_admin' ? 'admin' : 'employee'),
};
