import type { PortalManifest } from '@orbit/core/portals';
import { PROC_ROLES } from './config';

const ALL = PROC_ROLES.map((r) => r.id);
const BUY = ['buyer', 'manager', 'gm', 'accounts', 'admin'];
const STOCK = ['requester', 'buyer', 'store', 'manager', 'gm', 'admin'];

/** Portal module 2: Purchase. Each person has a purchase role (set by the company admin). */
export const procurementManifest: PortalManifest = {
  id: 'procurement',
  name: 'Purchase',
  workflowKind: 'procurement.request',
  defaultWorkflowKey: 'procurement.value_levels',
  nav: [
    { path: '', label: 'Dashboard', section: 'main', portalRoles: ALL },
    { path: 'queue', menu: 'Purchasing', label: 'Approvals and tasks', section: 'main', portalRoles: ALL.filter((r) => r !== 'requester'), badge: 'approvals' },
    { path: 'new', menu: 'Purchasing', label: 'New requisition', section: 'main', portalRoles: ['requester', 'buyer', 'store', 'manager', 'admin'] },
    { path: 'requests', menu: 'Purchasing', label: 'All requests', section: 'main', portalRoles: ALL },
    { path: 'orders', menu: 'Purchasing', label: 'Purchase orders', section: 'main', portalRoles: BUY },
    { path: 'stock', menu: 'Stock', label: 'Stock register', section: 'main', portalRoles: STOCK },
    { path: 'stock/entry', menu: 'Stock', label: 'Stock entry', section: 'main', portalRoles: ['store', 'admin'] },
    { path: 'stock/ledger', menu: 'Stock', label: 'Stock ledger', section: 'main', portalRoles: ['store', 'manager', 'admin'] },
    { path: 'suppliers', label: 'Suppliers', section: 'main', portalRoles: ['buyer', 'manager', 'admin'] },
    { path: 'admin/workflow', label: 'Purchase workflow', section: 'admin', roles: ['company_admin'] },
    { path: 'admin/form', label: 'Requisition form', section: 'admin', roles: ['company_admin'] },
    { path: 'admin/approvals', label: 'Approval rules', section: 'admin', roles: ['company_admin'] },
    { path: 'admin/roles', label: 'Purchase roles', section: 'admin', roles: ['company_admin'] },
    { path: 'admin/settings', label: 'Money and numbering', section: 'admin', roles: ['company_admin'] },
  ],
  settingsSchema: { groups: [] },
  portalRoles: PROC_ROLES,
  defaultPortalRole: (role) => (role === 'company_admin' ? 'admin' : role === 'management' ? 'gm' : 'requester'),
};
