'use server';
import { revalidatePath } from 'next/cache';
import { runAction } from '@orbit/core/next';
import { cancelPlan, confirmCheckout, startCheckout } from '@/billing/state';

type In<F> = F extends (tx: never, ctx: never, input: infer I) => unknown ? I : never;

export async function startCheckoutAction(input: In<typeof startCheckout>) {
  return runAction((tx, ctx) => startCheckout(tx, ctx, input));
}
export async function confirmCheckoutAction(input: In<typeof confirmCheckout>) {
  const res = await runAction((tx, ctx) => confirmCheckout(tx, ctx, input));
  revalidatePath('/manage', 'layout');
  return res;
}
export async function cancelPlanAction() {
  const res = await runAction((tx, ctx) => cancelPlan(tx, ctx));
  revalidatePath('/manage', 'layout');
  return res;
}
