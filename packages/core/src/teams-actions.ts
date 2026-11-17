'use server';
// Server action for Management → Project teams.
import { revalidatePath } from 'next/cache';
import { runAction } from './next/index';
import { addProject, saveTeam, type ProjectKind } from './teams';

export async function addProjectAction(input: { code: string; name: string }) {
  const res = await runAction((tx, ctx) => addProject(tx, ctx, input));
  if (res.ok) revalidatePath('/', 'layout');
  return res;
}

export async function saveTeamAction(input: { kind: ProjectKind; key: string; memberIds: string[] }) {
  const res = await runAction((tx, ctx) => saveTeam(tx, ctx, input));
  if (res.ok) revalidatePath('/', 'layout');
  return res;
}
