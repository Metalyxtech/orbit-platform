'use server';
// Server actions for GM process control, usable from any portal's page (passed to ProcessControl).
import { revalidatePath } from 'next/cache';
import { addProcessComment, setHold } from './holds';
import { runAction } from './next/index';

export async function setHoldAction(input: { entity: string; entityId: string; hold: boolean; note: string }) {
  const res = await runAction((tx, ctx) => setHold(tx, ctx, input));
  if (res.ok) revalidatePath('/', 'layout');
  return res;
}

export async function addProcessCommentAction(input: { entity: string; entityId: string; text: string }) {
  const res = await runAction((tx, ctx) => addProcessComment(tx, ctx, input));
  if (res.ok) revalidatePath('/', 'layout');
  return res;
}
