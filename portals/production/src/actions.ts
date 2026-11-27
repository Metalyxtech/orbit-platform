'use server';
// Server actions for the Production portal: each runs as the signed-in member in one RLS transaction.
import { runPortalAction } from '@orbit/core/next';

/** Every action here needs access to this portal (checked again server-side: actions can be called directly). */
const PORTAL = 'production';
import { admin, drawings, floor, mr, receipts, stock, store, workorders } from './server';

type In<F> = F extends (tx: never, ctx: never, input: infer I) => unknown ? I : never;

export async function createWorkOrderAction(input: In<typeof workorders.createWorkOrder>) {
  return runPortalAction(PORTAL, (tx, ctx) => workorders.createWorkOrder(tx, ctx, input));
}
export async function updateWorkOrderAction(input: In<typeof workorders.updateWorkOrder>) {
  return runPortalAction(PORTAL, (tx, ctx) => workorders.updateWorkOrder(tx, ctx, input));
}
export async function submitForReleaseAction(input: { id: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => workorders.submitForRelease(tx, ctx, input));
}
export async function decideReleaseAction(input: In<typeof workorders.decideRelease>) {
  return runPortalAction(PORTAL, (tx, ctx) => workorders.decideRelease(tx, ctx, input));
}
export async function cancelWorkOrderAction(input: { id: string; reason: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => workorders.cancelWorkOrder(tx, ctx, input));
}
export async function reportOutputAction(input: In<typeof floor.reportOutput>) {
  return runPortalAction(PORTAL, (tx, ctx) => floor.reportOutput(tx, ctx, input));
}
export async function finalReworkDoneAction(input: { workOrderId: string; remarks: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => floor.finalReworkDone(tx, ctx, input));
}
export async function issueMaterialsAction(input: In<typeof store.issueMaterials>) {
  return runPortalAction(PORTAL, (tx, ctx) => store.issueMaterials(tx, ctx, input));
}
export async function dispatchAction(input: { workOrderId: string; reference: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => store.dispatch(tx, ctx, input));
}
export async function saveProductionAdminAction(input: In<typeof admin.saveProductionAdmin>) {
  return runPortalAction(PORTAL, (tx, ctx) => admin.saveProductionAdmin(tx, ctx, input));
}
export async function startDrawingUploadAction(input: In<typeof drawings.startDrawingUpload>) {
  return runPortalAction(PORTAL, (tx, ctx) => drawings.startDrawingUpload(tx, ctx, input));
}
export async function confirmDrawingUploadAction(input: { docId: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => drawings.confirmDrawingUpload(tx, ctx, input));
}
export async function addDrawingLinkAction(input: In<typeof drawings.addDrawingLink>) {
  return runPortalAction(PORTAL, (tx, ctx) => drawings.addDrawingLink(tx, ctx, input));
}
export async function removeDrawingAction(input: { docId: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => drawings.removeDrawing(tx, ctx, input));
}

// ---------- material requests, production store ----------
export async function createMrAction(input: In<typeof mr.createMr>) {
  return runPortalAction(PORTAL, (tx, ctx) => mr.createMr(tx, ctx, input));
}
export async function issueMrAction(input: In<typeof mr.issueMr>) {
  return runPortalAction(PORTAL, (tx, ctx) => mr.issueMr(tx, ctx, input));
}
export async function askPurchaseAction(input: In<typeof mr.askPurchase>) {
  return runPortalAction(PORTAL, (tx, ctx) => mr.askPurchase(tx, ctx, input));
}
export async function decideMrAction(input: In<typeof mr.decideMr>) {
  return runPortalAction(PORTAL, (tx, ctx) => mr.decideMr(tx, ctx, input));
}
export async function cancelMrAction(input: { id: string; note: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => mr.cancelMr(tx, ctx, input));
}
export async function recordDeliveryAction(input: In<typeof mr.recordDelivery>) {
  return runPortalAction(PORTAL, (tx, ctx) => mr.recordDelivery(tx, ctx, input));
}
export async function receiveDirectAction(input: In<typeof receipts.receiveDirect>) {
  return runPortalAction(PORTAL, (tx, ctx) => receipts.receiveDirect(tx, ctx, input));
}
export async function startStoreDocUploadAction(input: In<typeof receipts.startReceiptUpload>) {
  return runPortalAction(PORTAL, (tx, ctx) => receipts.startReceiptUpload(tx, ctx, input));
}
export async function confirmStoreDocUploadAction(input: { fileId: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => receipts.confirmReceiptUpload(tx, ctx, input));
}
export async function adjustStockAction(input: In<typeof stock.adjustStock>) {
  return runPortalAction(PORTAL, (tx, ctx) => stock.adjustStock(tx, ctx, input));
}
