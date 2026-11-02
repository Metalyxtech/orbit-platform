'use server';
import { revalidatePath } from 'next/cache';
import { runAction } from '@orbit/core/next';
import { markRead, sendMessage, sendInput } from '@/messages';
import type { z } from 'zod';

export async function sendMessageAction(input: z.input<typeof sendInput>) {
  const res = await runAction((tx, ctx) => sendMessage(tx, ctx, input));
  if (res.ok) revalidatePath('/manage', 'layout');
  return res;
}

export async function markReadAction(id: string) {
  const res = await runAction((tx, ctx) => markRead(tx, ctx, id));
  if (res.ok) revalidatePath('/manage', 'layout');
  return res;
}
