import { describeProcess, linkProcess } from '@orbit/core/holds';
import { onQualityDecision } from '@orbit/core/quality';
import { onSupplyUpdate, servePurchase } from '@orbit/core/supply';
import { requests as purchaseRequests, supply as purchaseSupply } from '@orbit/portal-procurement/server';
import { describeMr, describeWo, mrParents, woParents } from '@orbit/portal-production/server';
import { inspections as qcInspections } from '@orbit/portal-quality/server';
import { enquiries as salesEnquiries } from '@orbit/portal-sales/server';
import { onQualityResult as productionQualityResult, onStoreQualityResult, onSupplyUpdate as productionSupplyUpdate } from '@orbit/portal-production/server';

// Portals talk through contracts in @orbit/core, never to each other. The app (which knows every
// portal) connects them here:
// - Quality's final approvals reach Purchase, Production and the production store (@orbit/core/quality).
// - Production's material requests reach Purchase, and Purchase reports back (@orbit/core/supply).
// - GM process control names each portal's records (@orbit/core/holds).
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
  describeProcess('proc_request', purchaseRequests.describeRequest);
  describeProcess('work_order', describeWo);
  describeProcess('mat_request', describeMr);
  describeProcess('qc_inspection', qcInspections.describeInspection);
  describeProcess('sales_enquiry', salesEnquiries.describeEnquiry);
  // A stop follows the work into the next portals: enquiry → work order → material request →
  // purchase → QC inspection.
  linkProcess('work_order', woParents);
  linkProcess('mat_request', mrParents);
  linkProcess('proc_request', purchaseRequests.requestParents);
  linkProcess('qc_inspection', qcInspections.inspectionParents);
}
registerQualityHandlers();
