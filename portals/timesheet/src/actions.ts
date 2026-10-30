'use server';
// Server actions for the Timesheet portal. Every call runs as the signed-in member inside one
// RLS-scoped transaction (runAction), then publishes outbox events and timers after commit.
import { runAction } from '@orbit/core/next';
import type { GridRow } from './calc';
import { admin, approvals, reports, week } from './server';

export async function saveEntriesAction(input: Parameters<typeof week.saveEntries>[2]) {
  return runAction((tx, ctx) => week.saveEntries(tx, ctx, input));
}
export async function copyLastWeekAction(input: { weekStart: string }) {
  return runAction((tx, ctx) => week.copyLastWeek(tx, ctx, input));
}
export async function previewRouteAction(input: { rows: GridRow[] }) {
  return runAction((tx, ctx) => week.previewRoute(tx, ctx, input));
}
export async function submitAction(input: { timesheetId: string; note?: string | null }) {
  return runAction((tx, ctx) => week.submit(tx, ctx, input));
}
export async function requestCorrectionAction(input: { timesheetId: string; reason: string }) {
  return runAction((tx, ctx) => week.requestCorrection(tx, ctx, input));
}
export async function taskDetailAction(input: { taskId: string }) {
  return runAction((tx, ctx) => approvals.taskDetail(tx, ctx, input));
}
export async function decideAction(input: Parameters<typeof approvals.decide>[2]) {
  return runAction((tx, ctx) => approvals.decide(tx, ctx, input));
}
export async function decideBulkAction(input: { taskIds: string[] }) {
  return runAction((tx, ctx) => approvals.decideBulk(tx, ctx, input));
}
export async function exportAction(input: { month: string; projectIds?: string[] }) {
  return runAction((tx, ctx) => reports.requestExport(tx, ctx, input));
}
export async function updateSettingsAction(input: unknown) {
  return runAction((tx, ctx) => admin.updateSettings(tx, ctx, input));
}
export async function importCsvAction(input: { csv: string; dryRun: boolean }) {
  return runAction((tx, ctx) => admin.importCsv(tx, ctx, input));
}
export async function updateMemberAction(input: Parameters<typeof admin.updateMember>[2]) {
  return runAction((tx, ctx) => admin.updateMember(tx, ctx, input));
}
export async function decideCorrectionAction(input: { id: string; approve: boolean }) {
  return runAction((tx, ctx) => admin.decideCorrection(tx, ctx, input));
}
export async function setWorkflowAction(input: { workflowDefinitionId: string }) {
  return runAction((tx, ctx) => admin.setWorkflow(tx, ctx, input));
}
export async function addMemberAction(input: Parameters<typeof admin.addMember>[2]) {
  return runAction((tx, ctx) => admin.addMember(tx, ctx, input));
}
export async function saveProjectAction(input: Parameters<typeof admin.saveProject>[2]) {
  return runAction((tx, ctx) => admin.saveProject(tx, ctx, input));
}
export async function saveCostCodeAction(input: Parameters<typeof admin.saveCostCode>[2]) {
  return runAction((tx, ctx) => admin.saveCostCode(tx, ctx, input));
}
