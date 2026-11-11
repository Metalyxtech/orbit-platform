import { onQualityDecision } from '@orbit/core/quality';
import { requests as purchaseRequests } from '@orbit/portal-procurement/server';
import { onQualityResult as productionQualityResult } from '@orbit/portal-production/server';

// The Quality portal's final approvals reach Purchase and Production through @orbit/core/quality,
// so no portal imports another. The app (which knows every portal) connects them here. Loaded by
// the portal registry and at server start (instrumentation.ts).

let done = false;
export function registerQualityHandlers() {
  if (done) return;
  done = true;
  onQualityDecision('purchase', purchaseRequests.onQualityResult);
  onQualityDecision('production', productionQualityResult);
}
registerQualityHandlers();
