'use server';
// Server actions for the Timesheet portal. Every call runs as the signed-in member inside one
// RLS-scoped transaction (runAction), then publishes outbox events and timers after commit.
import { runPortalAction } from '@orbit/core/next';

/** Every action here needs access to this portal (checked again server-side: actions can be called directly). */
const PORTAL = 'timesheet';
import type { GridRow } from './calc';
import { admin, approvals, covers, forms, reports, roster, week } from './server';

export async function saveEntriesAction(input: Parameters<typeof week.saveEntries>[2]) {
  return runPortalAction(PORTAL, (tx, ctx) => week.saveEntries(tx, ctx, input));
}
export async function copyLastWeekAction(input: { weekStart: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => week.copyLastWeek(tx, ctx, input));
}
export async function previewRouteAction(input: { rows: GridRow[]; weekStart?: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => week.previewRoute(tx, ctx, input));
}
export async function submitAction(input: { timesheetId: string; note?: string | null }) {
  return runPortalAction(PORTAL, (tx, ctx) => week.submit(tx, ctx, input));
}
export async function requestCorrectionAction(input: { timesheetId: string; reason: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => week.requestCorrection(tx, ctx, input));
}
export async function taskDetailAction(input: { taskId: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => approvals.taskDetail(tx, ctx, input));
}
export async function decideAction(input: Parameters<typeof approvals.decide>[2]) {
  return runPortalAction(PORTAL, (tx, ctx) => approvals.decide(tx, ctx, input));
}
export async function decideBulkAction(input: { taskIds: string[] }) {
  return runPortalAction(PORTAL, (tx, ctx) => approvals.decideBulk(tx, ctx, input));
}
export async function exportAction(input: { month: string; projectIds?: string[] }) {
  return runPortalAction(PORTAL, (tx, ctx) => reports.requestExport(tx, ctx, input));
}
export async function updateSettingsAction(input: unknown) {
  return runPortalAction(PORTAL, (tx, ctx) => admin.updateSettings(tx, ctx, input));
}
export async function importCsvAction(input: { csv: string; dryRun: boolean }) {
  return runPortalAction(PORTAL, (tx, ctx) => admin.importCsv(tx, ctx, input));
}
export async function updateMemberAction(input: Parameters<typeof admin.updateMember>[2]) {
  return runPortalAction(PORTAL, (tx, ctx) => admin.updateMember(tx, ctx, input));
}
export async function decideCorrectionAction(input: { id: string; approve: boolean }) {
  return runPortalAction(PORTAL, (tx, ctx) => admin.decideCorrection(tx, ctx, input));
}
export async function setWorkflowAction(input: { workflowDefinitionId: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => admin.setWorkflow(tx, ctx, input));
}
export async function addMemberAction(input: Parameters<typeof admin.addMember>[2]) {
  return runPortalAction(PORTAL, (tx, ctx) => admin.addMember(tx, ctx, input));
}
export async function saveProjectAction(input: Parameters<typeof admin.saveProject>[2]) {
  return runPortalAction(PORTAL, (tx, ctx) => admin.saveProject(tx, ctx, input));
}
export async function saveCostCodeAction(input: Parameters<typeof admin.saveCostCode>[2]) {
  return runPortalAction(PORTAL, (tx, ctx) => admin.saveCostCode(tx, ctx, input));
}
export async function saveCustomWorkflowAction(input: Parameters<typeof admin.saveCustomWorkflow>[2]) {
  return runPortalAction(PORTAL, (tx, ctx) => admin.saveCustomWorkflow(tx, ctx, input));
}
export async function changeMemberPortalAction(input: Parameters<typeof admin.changeMemberPortal>[2]) {
  return runPortalAction(PORTAL, (tx, ctx) => admin.changeMemberPortal(tx, ctx, input));
}
export async function setFormChoiceAction(input: { role: string; formId: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => forms.setFormChoice(tx, ctx, input));
}

export async function saveAdminCoversAction(input: Parameters<typeof covers.saveAdminCovers>[2]) {
  return runPortalAction(PORTAL, (tx, ctx) => covers.saveAdminCovers(tx, ctx, input));
}

// Roster and overtime.
export async function setRosterCellsAction(input: Parameters<typeof roster.setCells>[2]) {
  return runPortalAction(PORTAL, (tx, ctx) => roster.setCells(tx, ctx, input));
}
export async function copyRosterWeekAction(input: { weekStart: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => roster.copyRosterWeek(tx, ctx, input));
}
export async function publishRosterAction(input: { weekStart: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => roster.publishWeek(tx, ctx, input));
}
export async function requestOtAction(input: Parameters<typeof roster.requestOt>[2]) {
  return runPortalAction(PORTAL, (tx, ctx) => roster.requestOt(tx, ctx, input));
}
export async function cancelOtAction(input: { id: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => roster.cancelOt(tx, ctx, input));
}
export async function decideOtAction(input: { id: string; approve: boolean; note?: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => roster.decideOt(tx, ctx, input));
}
export async function saveShiftAction(input: Parameters<typeof roster.saveShift>[2]) {
  return runPortalAction(PORTAL, (tx, ctx) => roster.saveShift(tx, ctx, input));
}
export async function setShiftActiveAction(input: { id: string; active: boolean }) {
  return runPortalAction(PORTAL, (tx, ctx) => roster.setShiftActive(tx, ctx, input));
}
export async function saveHolidayAction(input: { date: string; name: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => roster.saveHoliday(tx, ctx, input));
}
export async function deleteHolidayAction(input: { id: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => roster.deleteHoliday(tx, ctx, input));
}
export async function saveOtRatesAction(input: { workday: number; offday: number }) {
  return runPortalAction(PORTAL, (tx, ctx) => roster.saveOtRates(tx, ctx, input));
}
