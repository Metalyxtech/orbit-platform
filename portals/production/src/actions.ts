'use server';
// Server actions for the Production portal: each runs as the signed-in member in one RLS transaction.
import { runAction } from '@orbit/core/next';
import { admin, drawings, floor, mr, receipts, stock, store, workorders } from './server';

type In<F> = F extends (tx: never, ctx: never, input: infer I) => unknown ? I : never;

export async function createWorkOrderAction(input: In<typeof workorders.createWorkOrder>) {
  return runAction((tx, ctx) => workorders.createWorkOrder(tx, ctx, input));
}
export async function updateWorkOrderAction(input: In<typeof workorders.updateWorkOrder>) {
  return runAction((tx, ctx) => workorders.updateWorkOrder(tx, ctx, input));
}
export async function submitForReleaseAction(input: { id: string }) {
  return runAction((tx, ctx) => workorders.submitForRelease(tx, ctx, input));
}
export async function decideReleaseAction(input: In<typeof workorders.decideRelease>) {
  return runAction((tx, ctx) => workorders.decideRelease(tx, ctx, input));
}
export async function cancelWorkOrderAction(input: { id: string; reason: string }) {
  return runAction((tx, ctx) => workorders.cancelWorkOrder(tx, ctx, input));
}
export async function reportOutputAction(input: In<typeof floor.reportOutput>) {
  return runAction((tx, ctx) => floor.reportOutput(tx, ctx, input));
}
export async function finalReworkDoneAction(input: { workOrderId: string; remarks: string }) {
  return runAction((tx, ctx) => floor.finalReworkDone(tx, ctx, input));
}
export async function issueMaterialsAction(input: In<typeof store.issueMaterials>) {
  return runAction((tx, ctx) => store.issueMaterials(tx, ctx, input));
}
export async function dispatchAction(input: { workOrderId: string; reference: string }) {
  return runAction((tx, ctx) => store.dispatch(tx, ctx, input));
}
export async function saveProductionAdminAction(input: In<typeof admin.saveProductionAdmin>) {
  return runAction((tx, ctx) => admin.saveProductionAdmin(tx, ctx, input));
}
export async function startDrawingUploadAction(input: In<typeof drawings.startDrawingUpload>) {
  return runAction((tx, ctx) => drawings.startDrawingUpload(tx, ctx, input));
}
export async function confirmDrawingUploadAction(input: { docId: string }) {
  return runAction((tx, ctx) => drawings.confirmDrawingUpload(tx, ctx, input));
}
export async function addDrawingLinkAction(input: In<typeof drawings.addDrawingLink>) {
  return runAction((tx, ctx) => drawings.addDrawingLink(tx, ctx, input));
}
export async function removeDrawingAction(input: { docId: string }) {
  return runAction((tx, ctx) => drawings.removeDrawing(tx, ctx, input));
}

// ---------- material requests, production store ----------
export async function createMrAction(input: In<typeof mr.createMr>) {
  return runAction((tx, ctx) => mr.createMr(tx, ctx, input));
}
export async function issueMrAction(input: In<typeof mr.issueMr>) {
  return runAction((tx, ctx) => mr.issueMr(tx, ctx, input));
}
export async function askPurchaseAction(input: In<typeof mr.askPurchase>) {
  return runAction((tx, ctx) => mr.askPurchase(tx, ctx, input));
}
export async function decideMrAction(input: In<typeof mr.decideMr>) {
  return runAction((tx, ctx) => mr.decideMr(tx, ctx, input));
}
export async function cancelMrAction(input: { id: string; note: string }) {
  return runAction((tx, ctx) => mr.cancelMr(tx, ctx, input));
}
export async function recordDeliveryAction(input: In<typeof mr.recordDelivery>) {
  return runAction((tx, ctx) => mr.recordDelivery(tx, ctx, input));
}
export async function receiveDirectAction(input: In<typeof receipts.receiveDirect>) {
  return runAction((tx, ctx) => receipts.receiveDirect(tx, ctx, input));
}
export async function startStoreDocUploadAction(input: In<typeof receipts.startReceiptUpload>) {
  return runAction((tx, ctx) => receipts.startReceiptUpload(tx, ctx, input));
}
export async function confirmStoreDocUploadAction(input: { fileId: string }) {
  return runAction((tx, ctx) => receipts.confirmReceiptUpload(tx, ctx, input));
}
export async function adjustStockAction(input: In<typeof stock.adjustStock>) {
  return runAction((tx, ctx) => stock.adjustStock(tx, ctx, input));
}
