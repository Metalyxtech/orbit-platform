import type { PortalManifest } from '@orbit/core/portals';
import { PROD_ROLES } from './config';

const ALL = PROD_ROLES.map((r) => r.id);

/** Portal module 4: Production. Each person has a production role (set by the company admin). */
export const productionManifest: PortalManifest = {
  id: 'production',
  name: 'Production',
  workflowKind: 'production.work_order',
  defaultWorkflowKey: 'production.release',
  nav: [
    { path: '', label: 'Dashboard', section: 'main', portalRoles: ALL },
    { path: 'queue', label: 'My tasks', section: 'main', portalRoles: ALL, badge: 'approvals' },
    { path: 'orders', menu: 'Work orders', label: 'All work orders', section: 'main', portalRoles: ALL },
    { path: 'new', menu: 'Work orders', label: 'New work order', section: 'main', portalRoles: ['engineer', 'manager', 'admin'] },
    { path: 'board', menu: 'Work orders', label: 'Shop-floor board', section: 'main', portalRoles: ALL },
    { path: 'report', menu: 'Shop floor', label: 'Daily production report', section: 'main', portalRoles: ['supervisor', 'manager', 'admin'] },
    { path: 'output', menu: 'Shop floor', label: 'Output log', section: 'main', portalRoles: ALL },
    { path: 'store', label: 'Store: issue and dispatch', section: 'main', portalRoles: ['store', 'manager', 'admin'] },
    { path: 'trades', label: 'Trade forms', section: 'main', portalRoles: ['engineer', 'manager', 'supervisor', 'gm', 'admin'] },
    { path: 'admin/settings', label: 'Production settings', section: 'admin', roles: ['company_admin'] },
  ],
  settingsSchema: { groups: [] },
  portalRoles: PROD_ROLES,
  defaultPortalRole: (role) => (role === 'company_admin' ? 'admin' : role === 'management' ? 'gm' : 'supervisor'),
};
