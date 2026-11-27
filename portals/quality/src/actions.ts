'use server';
// Server actions for the Quality portal: each runs as the signed-in member in one RLS transaction.
import { runPortalAction } from '@orbit/core/next';

/** Every action here needs access to this portal (checked again server-side: actions can be called directly). */
const PORTAL = 'quality';
import { admin, inspections } from './server';

type In<F> = F extends (tx: never, ctx: never, input: infer I) => unknown ? I : never;

export async function submitReportAction(input: In<typeof inspections.submitReport>) {
  return runPortalAction(PORTAL, (tx, ctx) => inspections.submitReport(tx, ctx, input));
}
export async function decideAction(input: { id: string; approve: boolean; note?: string }) {
  return runPortalAction(PORTAL, (tx, ctx) => inspections.decide(tx, ctx, input));
}
export async function saveQualityAdminAction(input: In<typeof admin.saveQualityAdmin>) {
  return runPortalAction(PORTAL, (tx, ctx) => admin.saveQualityAdmin(tx, ctx, input));
}
export async function createDirectAction(input: In<typeof inspections.createDirect>) {
  return runPortalAction(PORTAL, (tx, ctx) => inspections.createDirect(tx, ctx, input));
}
