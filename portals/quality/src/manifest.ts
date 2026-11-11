import type { PortalManifest } from '@orbit/core/portals';
import { QC_ROLES } from './config';

const ALL = QC_ROLES.map((r) => r.id);

/** Portal module 5: Quality. Inspections come from Purchase (material) and Production (finished work). */
export const qualityManifest: PortalManifest = {
  id: 'quality',
  name: 'Quality',
  workflowKind: 'quality.inspection',
  defaultWorkflowKey: 'quality.final_approval',
  nav: [
    { path: '', label: 'Quality dashboard', section: 'main', portalRoles: ALL },
    { path: 'queue', label: 'My tasks', section: 'main', portalRoles: ALL, badge: 'approvals' },
    { path: 'inspections', label: 'Inspections', section: 'main', portalRoles: ALL },
    { path: 'reports', label: 'Final reports', section: 'main', portalRoles: ALL },
    { path: 'admin/settings', label: 'Quality settings', section: 'admin', roles: ['company_admin'] },
  ],
  settingsSchema: { groups: [] },
  portalRoles: QC_ROLES,
  defaultPortalRole: (role) => (role === 'company_admin' ? 'admin' : role === 'management' ? 'gm' : 'inspector'),
};
