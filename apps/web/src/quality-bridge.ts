import { onQualityDecision } from '@orbit/core/quality';
import { onSupplyUpdate, servePurchase } from '@orbit/core/supply';
import { requests as purchaseRequests, supply as purchaseSupply } from '@orbit/portal-procurement/server';
import { onQualityResult as productionQualityResult, onStoreQualityResult, onSupplyUpdate as productionSupplyUpdate } from '@orbit/portal-production/server';

// Portals talk through contracts in @orbit/core, never to each other. The app (which knows every
// portal) connects them here:
// - Quality's final approvals reach Purchase, Production and the production store (@orbit/core/quality).
// - Production's material requests reach Purchase, and Purchase reports back (@orbit/core/supply).
// Loaded by the portal registry and at server start (instrumentation.ts).

let done = false;
export function registerQualityHandlers() {
  if (done) return;
  done = true;
  onQualityDecision('purchase', purchaseRequests.onQualityResult);
  onQualityDecision('production', productionQualityResult);
  onQualityDecision('store', onStoreQualityResult);
  servePurchase({ raise: purchaseSupply.raiseFromProduction, deliver: purchaseSupply.deliverFromProduction, status: purchaseSupply.supplyStatus });
  onSupplyUpdate('production', productionSupplyUpdate);
}
registerQualityHandlers();
