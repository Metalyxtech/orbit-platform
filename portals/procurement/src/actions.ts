'use server';
// Server actions for the Purchase portal: each runs as the signed-in member in one RLS transaction.
import { runAction } from '@orbit/core/next';
import { admin, requests, stock, suppliers } from './server';

type In<F> = F extends (tx: never, ctx: never, input: infer I) => unknown ? I : never;

export async function createRequestAction(input: In<typeof requests.createRequest>) {
  return runAction((tx, ctx) => requests.createRequest(tx, ctx, input));
}
export async function stockCheckAction(input: In<typeof requests.stockCheck>) {
  return runAction((tx, ctx) => requests.stockCheck(tx, ctx, input));
}
export async function issueStockAction(input: { id: string }) {
  return runAction((tx, ctx) => requests.issueStock(tx, ctx, input));
}
export async function approveAction(input: { id: string; note?: string }) {
  return runAction((tx, ctx) => requests.approve(tx, ctx, input));
}
export async function rejectAction(input: { id: string; note?: string }) {
  return runAction((tx, ctx) => requests.reject(tx, ctx, input));
}
export async function addQuoteAction(input: In<typeof requests.addQuote>) {
  return runAction((tx, ctx) => requests.addQuote(tx, ctx, input));
}
export async function awardAction(input: { id: string; quoteId: string }) {
  return runAction((tx, ctx) => requests.award(tx, ctx, input));
}
export async function issuePoAction(input: { id: string; checks: string[] }) {
  return runAction((tx, ctx) => requests.issuePo(tx, ctx, input));
}
export async function receiveAction(input: In<typeof requests.receive>) {
  return runAction((tx, ctx) => requests.receive(tx, ctx, input));
}
export async function inspectAction(input: In<typeof requests.inspect>) {
  return runAction((tx, ctx) => requests.inspect(tx, ctx, input));
}
export async function invoiceAction(input: In<typeof requests.matchInvoice>) {
  return runAction((tx, ctx) => requests.matchInvoice(tx, ctx, input));
}
export async function addItemAction(input: In<typeof stock.addItem>) {
  return runAction((tx, ctx) => stock.addItem(tx, ctx, input));
}
export async function stockEntryAction(input: In<typeof stock.stockEntry>) {
  return runAction((tx, ctx) => stock.stockEntry(tx, ctx, input));
}
export async function addSupplierAction(input: In<typeof suppliers.addSupplier>) {
  return runAction((tx, ctx) => suppliers.addSupplier(tx, ctx, input));
}
export async function applyTemplateAction(input: { template: string }) {
  return runAction((tx, ctx) => admin.applyTemplate(tx, ctx, input));
}
export async function saveWorkflowAction(input: In<typeof admin.saveWorkflow>) {
  return runAction((tx, ctx) => admin.saveWorkflow(tx, ctx, input));
}
export async function saveFormAction(input: In<typeof admin.saveForm>) {
  return runAction((tx, ctx) => admin.saveForm(tx, ctx, input));
}
export async function saveLevelsAction(input: In<typeof admin.saveLevels>) {
  return runAction((tx, ctx) => admin.saveLevels(tx, ctx, input));
}
export async function saveMoneyAction(input: In<typeof admin.saveMoney>) {
  return runAction((tx, ctx) => admin.saveMoney(tx, ctx, input));
}
export async function setPurchaseRoleAction(input: { membershipId: string; role: string }) {
  return runAction((tx, ctx) => admin.setPurchaseRole(tx, ctx, input));
}
export async function addIndustryCheckAction(input: { id: string }) {
  return runAction((tx, ctx) => admin.addIndustryCheck(tx, ctx, input));
}
export async function removeIndustryCheckAction(input: { id: string }) {
  return runAction((tx, ctx) => admin.removeIndustryCheck(tx, ctx, input));
}
export async function setAdminCoversAction(input: { membershipId: string; roles: string[] }) {
  return runAction((tx, ctx) => admin.setAdminCovers(tx, ctx, input));
}
