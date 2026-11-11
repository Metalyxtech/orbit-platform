'use server';
// Server actions for the Quality portal: each runs as the signed-in member in one RLS transaction.
import { runAction } from '@orbit/core/next';
import { admin, inspections } from './server';

type In<F> = F extends (tx: never, ctx: never, input: infer I) => unknown ? I : never;

export async function submitReportAction(input: In<typeof inspections.submitReport>) {
  return runAction((tx, ctx) => inspections.submitReport(tx, ctx, input));
}
export async function decideAction(input: { id: string; approve: boolean; note?: string }) {
  return runAction((tx, ctx) => inspections.decide(tx, ctx, input));
}
export async function saveQualityAdminAction(input: In<typeof admin.saveQualityAdmin>) {
  return runAction((tx, ctx) => admin.saveQualityAdmin(tx, ctx, input));
}
