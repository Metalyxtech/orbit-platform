'use server';
// Server actions for the Sales portal: each runs as the signed-in member in one RLS transaction.
import { runAction } from '@orbit/core/next';
import { admin, customers, docs, enquiries, orders } from './server';

type In<F> = F extends (tx: never, ctx: never, input: infer I) => unknown ? I : never;

export async function createEnquiryAction(input: In<typeof enquiries.createEnquiry>) {
  return runAction((tx, ctx) => enquiries.createEnquiry(tx, ctx, input));
}
export async function updateProjectAction(input: In<typeof enquiries.updateProject>) {
  return runAction((tx, ctx) => enquiries.updateProject(tx, ctx, input));
}
export async function setFollowUpAction(input: In<typeof enquiries.setFollowUp>) {
  return runAction((tx, ctx) => enquiries.setFollowUp(tx, ctx, input));
}
export async function saveLinesAction(input: In<typeof enquiries.saveLines>) {
  return runAction((tx, ctx) => enquiries.saveLines(tx, ctx, input));
}
export async function saveCostingAction(input: In<typeof enquiries.saveCosting>) {
  return runAction((tx, ctx) => enquiries.saveCosting(tx, ctx, input));
}
export async function setDiscountAction(input: { id: string; discount: number }) {
  return runAction((tx, ctx) => enquiries.setDiscount(tx, ctx, input));
}
export async function sendToCostingAction(input: { id: string }) {
  return runAction((tx, ctx) => enquiries.sendToCosting(tx, ctx, input));
}
export async function pricingDoneAction(input: { id: string }) {
  return runAction((tx, ctx) => enquiries.pricingDone(tx, ctx, input));
}
export async function reopenProjectAction(input: { id: string }) {
  return runAction((tx, ctx) => enquiries.reopenProject(tx, ctx, input));
}
export async function askApprovalAction(input: In<typeof enquiries.askApproval>) {
  return runAction((tx, ctx) => enquiries.askApproval(tx, ctx, input));
}
export async function decideQuoteAction(input: In<typeof enquiries.decideQuote>) {
  return runAction((tx, ctx) => enquiries.decideQuote(tx, ctx, input));
}
export async function sendQuoteAction(input: { id: string }) {
  return runAction((tx, ctx) => enquiries.sendQuote(tx, ctx, input));
}
export async function toNegotiationAction(input: { id: string }) {
  return runAction((tx, ctx) => enquiries.toNegotiation(tx, ctx, input));
}
export async function markWonAction(input: { id: string; advancePct?: number }) {
  return runAction((tx, ctx) => enquiries.markWon(tx, ctx, input));
}
export async function markLostAction(input: { id: string; reason: string }) {
  return runAction((tx, ctx) => enquiries.markLost(tx, ctx, input));
}
export async function addCustomerAction(input: In<typeof customers.addCustomer>) {
  return runAction((tx, ctx) => customers.addCustomer(tx, ctx, input));
}
export async function startDocUploadAction(input: In<typeof docs.startDocUpload>) {
  return runAction((tx, ctx) => docs.startDocUpload(tx, ctx, input));
}
export async function confirmDocUploadAction(input: { docId: string }) {
  return runAction((tx, ctx) => docs.confirmDocUpload(tx, ctx, input));
}
export async function addLinkAction(input: In<typeof docs.addLink>) {
  return runAction((tx, ctx) => docs.addLink(tx, ctx, input));
}
export async function removeDocAction(input: { docId: string }) {
  return runAction((tx, ctx) => docs.removeDoc(tx, ctx, input));
}
export async function confirmOrderAction(input: { id: string }) {
  return runAction((tx, ctx) => orders.confirmOrder(tx, ctx, input));
}
export async function advanceOrderAction(input: { id: string }) {
  return runAction((tx, ctx) => orders.advanceOrder(tx, ctx, input));
}
export async function raiseInvoiceAction(input: { id: string }) {
  return runAction((tx, ctx) => orders.raiseInvoice(tx, ctx, input));
}
export async function recordPaymentAction(input: In<typeof orders.recordPayment>) {
  return runAction((tx, ctx) => orders.recordPayment(tx, ctx, input));
}
export async function saveSalesAdminAction(input: In<typeof admin.saveSalesAdmin>) {
  return runAction((tx, ctx) => admin.saveSalesAdmin(tx, ctx, input));
}
export async function setTargetsAction(input: { targets: Record<string, number> }) {
  return runAction((tx, ctx) => admin.setTargets(tx, ctx, input));
}
