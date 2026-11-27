import { registerPortalGate } from '@orbit/core/next';
import { accessiblePortals } from './portal-access';

/**
 * Portal server actions run only for people who may open that portal: the same rule the portal
 * pages use (switched on for the company, and given to the person unless admin or management).
 */
export function registerPortalAccessGate() {
  registerPortalGate(async (tx, ctx, portal) => (await accessiblePortals(tx, ctx)).includes(portal));
}
