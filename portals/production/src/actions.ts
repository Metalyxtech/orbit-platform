'use server';
// Server actions for the Production portal: each runs as the signed-in member in one RLS transaction.
import { runAction } from '@orbit/core/next';
import { admin, floor, quality, store, workorders } from './server';

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
export async function reworkDoneAction(input: { operationId: string; remarks: string }) {
  return runAction((tx, ctx) => floor.reworkDone(tx, ctx, input));
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
export async function inspectAction(input: In<typeof quality.inspect>) {
  return runAction((tx, ctx) => quality.inspect(tx, ctx, input));
}
export async function closeNcrAction(input: { id: string; action: string }) {
  return runAction((tx, ctx) => quality.closeNcr(tx, ctx, input));
}
export async function saveProductionAdminAction(input: In<typeof admin.saveProductionAdmin>) {
  return runAction((tx, ctx) => admin.saveProductionAdmin(tx, ctx, input));
}
