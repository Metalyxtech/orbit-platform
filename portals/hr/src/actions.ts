'use server';
// Server actions for the HR portal: each runs as the signed-in member in one RLS transaction, and
// only for people who may open the HR portal.
import { runPortalAction } from '@orbit/core/next';
import { employees, leave } from './server';

/** Every action here needs access to the HR portal (checked again server-side). */
const PORTAL = 'hr';

type In<F> = F extends (tx: never, ctx: never, input: infer I) => unknown ? I : never;

export async function requestLeaveAction(input: In<typeof leave.requestLeave>) {
  return runPortalAction(PORTAL, (tx, ctx) => leave.requestLeave(tx, ctx, input));
}
export async function cancelLeaveAction(input: { id: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => leave.cancelLeave(tx, ctx, input));
}
export async function decideLeaveAction(input: { id: string; approve: boolean; note?: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => leave.decideLeave(tx, ctx, input));
}
export async function saveLeaveTypeAction(input: In<typeof leave.saveLeaveType>) {
  return runPortalAction(PORTAL, (tx, ctx) => leave.saveLeaveType(tx, ctx, input));
}
export async function saveRecordAction(input: In<typeof employees.saveRecord>) {
  return runPortalAction(PORTAL, (tx, ctx) => employees.saveRecord(tx, ctx, input));
}
