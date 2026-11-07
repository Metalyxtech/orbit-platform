import type { PortalManifest } from '@orbit/core/portals';

/**
 * Custom portal 1: built for one customer from the forms they uploaded (Company admin >
 * Custom requirements). Everything for this customer lives in this folder, so changes here
 * never affect the Timesheet or Purchase portals. Rename `name` to the customer's portal name.
 */
export const custom1Manifest: PortalManifest = {
  id: 'custom-1',
  name: 'Custom portal',
  workflowKind: 'custom1.submit',
  defaultWorkflowKey: 'custom1.single_step',
  custom: true,
  nav: [{ path: '', label: 'Home', section: 'main' }],
  settingsSchema: { groups: [] },
};
