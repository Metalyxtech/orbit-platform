'use server';
// Server actions for the Sales portal: each runs as the signed-in member in one RLS transaction.
import { runPortalAction } from '@orbit/core/next';

/** Every action here needs access to this portal (checked again server-side: actions can be called directly). */
const PORTAL = 'sales';
import { admin, customers, docs, enquiries, orders } from './server';

type In<F> = F extends (tx: never, ctx: never, input: infer I) => unknown ? I : never;

export async function createEnquiryAction(input: In<typeof enquiries.createEnquiry>) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.createEnquiry(tx, ctx, input));
}
export async function updateProjectAction(input: In<typeof enquiries.updateProject>) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.updateProject(tx, ctx, input));
}
export async function setFollowUpAction(input: In<typeof enquiries.setFollowUp>) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.setFollowUp(tx, ctx, input));
}
export async function saveLinesAction(input: In<typeof enquiries.saveLines>) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.saveLines(tx, ctx, input));
}
export async function saveCostingAction(input: In<typeof enquiries.saveCosting>) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.saveCosting(tx, ctx, input));
}
export async function setDiscountAction(input: { id: string; discount: number }) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.setDiscount(tx, ctx, input));
}
export async function sendToCostingAction(input: { id: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.sendToCosting(tx, ctx, input));
}
export async function pricingDoneAction(input: { id: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.pricingDone(tx, ctx, input));
}
export async function reopenProjectAction(input: { id: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.reopenProject(tx, ctx, input));
}
export async function askApprovalAction(input: In<typeof enquiries.askApproval>) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.askApproval(tx, ctx, input));
}
export async function decideQuoteAction(input: In<typeof enquiries.decideQuote>) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.decideQuote(tx, ctx, input));
}
export async function sendQuoteAction(input: { id: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.sendQuote(tx, ctx, input));
}
export async function toNegotiationAction(input: { id: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.toNegotiation(tx, ctx, input));
}
export async function markWonAction(input: { id: string; advancePct?: number }) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.markWon(tx, ctx, input));
}
export async function markLostAction(input: { id: string; reason: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => enquiries.markLost(tx, ctx, input));
}
export async function addCustomerAction(input: In<typeof customers.addCustomer>) {
  return runPortalAction(PORTAL, (tx, ctx) => customers.addCustomer(tx, ctx, input));
}
export async function startDocUploadAction(input: In<typeof docs.startDocUpload>) {
  return runPortalAction(PORTAL, (tx, ctx) => docs.startDocUpload(tx, ctx, input));
}
export async function confirmDocUploadAction(input: { docId: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => docs.confirmDocUpload(tx, ctx, input));
}
export async function addLinkAction(input: In<typeof docs.addLink>) {
  return runPortalAction(PORTAL, (tx, ctx) => docs.addLink(tx, ctx, input));
}
export async function removeDocAction(input: { docId: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => docs.removeDoc(tx, ctx, input));
}
export async function confirmOrderAction(input: { id: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => orders.confirmOrder(tx, ctx, input));
}
export async function advanceOrderAction(input: { id: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => orders.advanceOrder(tx, ctx, input));
}
export async function raiseInvoiceAction(input: { id: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => orders.raiseInvoice(tx, ctx, input));
}
export async function recordPaymentAction(input: In<typeof orders.recordPayment>) {
  return runPortalAction(PORTAL, (tx, ctx) => orders.recordPayment(tx, ctx, input));
}
export async function saveSalesAdminAction(input: In<typeof admin.saveSalesAdmin>) {
  return runPortalAction(PORTAL, (tx, ctx) => admin.saveSalesAdmin(tx, ctx, input));
}
export async function setTargetsAction(input: { targets: Record<string, number> }) {
  return runPortalAction(PORTAL, (tx, ctx) => admin.setTargets(tx, ctx, input));
}
