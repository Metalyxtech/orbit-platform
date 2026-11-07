'use server';
import { revalidatePath } from 'next/cache';
import { runAction } from '@orbit/core/next';
import { confirmFileUpload, createRequest, startFileUpload } from '@/custom/requests';

type In<F> = F extends (tx: never, ctx: never, input: infer I) => unknown ? I : never;

export async function createCustomRequestAction(input: In<typeof createRequest>) {
  return runAction((tx, ctx) => createRequest(tx, ctx, input));
}
export async function startCustomUploadAction(input: In<typeof startFileUpload>) {
  return runAction((tx, ctx) => startFileUpload(tx, ctx, input));
}
export async function confirmCustomUploadAction(input: { fileId: string }) {
  const res = await runAction((tx, ctx) => confirmFileUpload(tx, ctx, input));
  revalidatePath('/manage/company/custom');
  return res;
}
