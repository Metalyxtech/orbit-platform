import { registerActionGate } from '@orbit/core/next';
import { ENDED_MESSAGE } from './messages';
import { billingStateFor, missing } from './state';

/**
 * Once a company's free period or plan has ended, server actions are refused (the pages already
 * show the "period ended" pop-up). Paying for a plan is exempt: those actions pass `always`.
 */
export function registerSubscriptionGate() {
  registerActionGate(async (tx, ctx) => {
    let usable = true;
    try {
      usable = (await tx.transaction((sp) => billingStateFor(sp, ctx.companyId))).usable;
    } catch (err) {
      if (!missing(err)) throw err;
    }
    if (!usable) throw new Error(ENDED_MESSAGE);
  });
}
