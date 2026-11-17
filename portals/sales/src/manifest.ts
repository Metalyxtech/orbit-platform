import type { PortalManifest } from '@orbit/core/portals';
import { SALES_ROLES } from './config';

const ALL = SALES_ROLES.map((r) => r.id);
const SELLING = ['exec', 'estimator', 'manager', 'gm', 'admin'];

/** Portal module 3: Sales. Each person has a sales role (set by the company admin). */
export const salesManifest: PortalManifest = {
  id: 'sales',
  name: 'Sales',
  workflowKind: 'sales.quotation',
  defaultWorkflowKey: 'sales.discount_levels',
  nav: [
    { path: '', label: 'Dashboard', section: 'main', portalRoles: ALL },
    { path: 'queue', menu: 'Selling', label: 'Approvals and tasks', section: 'main', portalRoles: ALL, badge: 'approvals' },
    { path: 'pipeline', menu: 'Selling', label: 'Pipeline', section: 'main', portalRoles: SELLING },
    { path: 'new', menu: 'Selling', label: 'New enquiry', section: 'main', portalRoles: ['exec', 'manager', 'admin'] },
    { path: 'enquiries', menu: 'Selling', label: 'Enquiries', section: 'main', portalRoles: SELLING },
    { path: 'quotations', menu: 'Selling', label: 'Quotations', section: 'main', portalRoles: SELLING },
    { path: 'orders', menu: 'Orders and money', label: 'Sales orders', section: 'main', portalRoles: ALL },
    { path: 'invoices', menu: 'Orders and money', label: 'Invoices and collections', section: 'main', portalRoles: ['accounts', 'manager', 'gm', 'admin'] },
    { path: 'customers', label: 'Customers', section: 'main', portalRoles: ALL },
    { path: 'targets', label: 'Targets', section: 'main', portalRoles: ['exec', 'manager', 'gm', 'admin'] },
    { path: 'admin/settings', label: 'Sales settings', section: 'admin', roles: ['company_admin'] },
  ],
  settingsSchema: { groups: [] },
  portalRoles: SALES_ROLES,
  defaultPortalRole: (role) => (role === 'company_admin' ? 'admin' : role === 'management' ? 'gm' : 'exec'),
};
