'use server';
// Server action for Management → Project teams.
import { revalidatePath } from 'next/cache';
import { runAction } from './next/index';
import { saveTeam } from './teams';

export async function saveTeamAction(input: { salesOrderId: string; memberIds: string[] }) {
  const res = await runAction((tx, ctx) => saveTeam(tx, ctx, input));
  if (res.ok) revalidatePath('/', 'layout');
  return res;
}
