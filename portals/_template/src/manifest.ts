import type { PortalManifest } from '@orbit/core/portals';

export const templateManifest: PortalManifest = {
  id: 'template',
  name: 'Template',
  workflowKind: 'template.submit',
  defaultWorkflowKey: 'template.single_step',
  nav: [
    { path: '', label: 'Home', section: 'main' },
    { path: 'admin/settings', label: 'Settings', section: 'admin', roles: ['company_admin'] },
  ],
  settingsSchema: {
    groups: [{ title: 'General', fields: [{ key: 'enabled', label: 'Enabled', type: 'toggle' }] }],
  },
};
