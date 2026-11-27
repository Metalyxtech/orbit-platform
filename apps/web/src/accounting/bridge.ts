import { onAccountingReady, serveAccountingDocs } from '@orbit/core/accounting';
import { purchaseBillDocs } from '@orbit/portal-procurement/server';
import { salesInvoiceDocs } from '@orbit/portal-sales/server';
import { sendIfAutomatic } from './send';

// Connects the portals' invoices and bills to the accounting connections (@orbit/core/accounting).
// Loaded by the portal registry and at server start (instrumentation.ts), like quality-bridge.ts.

let done = false;
export function registerAccountingBridge() {
  if (done) return;
  done = true;
  serveAccountingDocs('sales_invoice', salesInvoiceDocs);
  serveAccountingDocs('purchase_bill', purchaseBillDocs);
  // Never lets a failed send reach the person who raised the invoice: it shows on the Accounting page.
  onAccountingReady((companyId, kind, id) =>
    sendIfAutomatic(companyId, kind, id).catch((err) => console.error(JSON.stringify({ at: 'accounting.auto', kind, error: String(err) }))),
  );
}
registerAccountingBridge();
