'use server';
import { revalidatePath } from 'next/cache';
import { runAction } from '@orbit/core/next';
import { addPerson, changePersonPortal, setPersonPortalRole } from '@/company-admin/people';
import { cancelCompanyPortal, requestCompanyPortal } from '@/company-admin/portals';

type In<F> = F extends (tx: never, ctx: never, input: infer I) => unknown ? I : never;

export async function requestCompanyPortalAction(input: { portal: string }) {
  return runAction((tx, ctx) => requestCompanyPortal(tx, ctx, input));
}
export async function cancelCompanyPortalAction(input: { portal: string }) {
  return runAction((tx, ctx) => cancelCompanyPortal(tx, ctx, input));
}
export async function changePersonPortalAction(input: In<typeof changePersonPortal>) {
  return runAction((tx, ctx) => changePersonPortal(tx, ctx, input));
}
export async function setPersonPortalRoleAction(input: In<typeof setPersonPortalRole>) {
  return runAction((tx, ctx) => setPersonPortalRole(tx, ctx, input));
}
export async function addPersonAction(input: In<typeof addPerson>) {
  const res = await runAction((tx, ctx) => addPerson(tx, ctx, input));
  if (res.ok) revalidatePath('/manage/company/people');
  return res;
}
