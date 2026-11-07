import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { customPlans, type Tx } from '@orbit/db';
import { installmentOf } from '../billing/plans';

// A custom customer's deal, set by Super Admin: switched on, label, monthly / yearly price, people.

export type CustomPlan = typeof customPlans.$inferSelect;
/** monthly, yearly, or yearly paid monthly (12 payments over a 12-month term). */
export type CustomCycle = 'monthly' | 'yearly' | 'yearly_monthly';

/** The company's custom deal, or null when it is a normal customer. */
export async function getCustomPlan(tx: Tx, companyId: string): Promise<CustomPlan | null> {
  const [row] = await tx.select().from(customPlans).where(eq(customPlans.companyId, companyId));
  return row ?? null;
}

/** Credit off the first yearly payment, if Orbit gave one and it has not been used yet. */
export const customCredit = (p: Pick<CustomPlan, 'yearlyCredit' | 'creditUsedAt'>, cycle: CustomCycle) => (cycle === 'yearly' && p.yearlyCredit > 0 && !p.creditUsedAt ? p.yearlyCredit : 0);

/** The credit has been used by a confirmed yearly checkout. */
export async function markCreditUsed(tx: Tx, companyId: string) {
  await tx.update(customPlans).set({ creditUsedAt: new Date() }).where(eq(customPlans.companyId, companyId));
}

/** The price for one cycle in the company's currency (whole rupees or dollars), or null if not offered. */
export const customPrice = (p: Pick<CustomPlan, 'monthlyPrice' | 'yearlyPrice' | 'allowInstallments'>, cycle: CustomCycle) =>
  cycle === 'yearly' ? p.yearlyPrice : cycle === 'yearly_monthly' ? (p.allowInstallments && p.yearlyPrice ? installmentOf(p.yearlyPrice) : null) : p.monthlyPrice;

/** Words for a custom plan's cycle. */
export const customCycleLabel = (cycle: string) => (cycle === 'yearly' ? 'Yearly' : cycle === 'yearly_monthly' ? 'Yearly, paid monthly' : 'Monthly');

const money = z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().positive().max(100_000_000).nullable());
export const customPlanInput = z.object({
  enabled: z.boolean(),
  label: z.string().trim().min(2).max(120),
  monthlyPrice: money,
  yearlyPrice: money,
  maxUsers: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().positive().max(1_000_000).nullable()),
  note: z.string().trim().max(2000).optional(),
  allowInstallments: z.boolean().default(false),
});

/** Super Admin saves the deal. */
export async function saveCustomPlan(tx: Tx, companyId: string, raw: z.input<typeof customPlanInput>) {
  const v = customPlanInput.parse(raw);
  const values = { enabled: v.enabled, label: v.label, monthlyPrice: v.monthlyPrice, yearlyPrice: v.yearlyPrice, maxUsers: v.maxUsers, note: v.note || null, allowInstallments: v.allowInstallments && !!v.yearlyPrice };
  await tx
    .insert(customPlans)
    .values({ companyId, ...values })
    .onConflictDoUpdate({ target: customPlans.companyId, set: { ...values, updatedAt: new Date() } });
  return v;
}

const missingTable = (err: unknown) => {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '42P01' || /relation "custom_\w+" does not exist/.test(String(err));
};

/** The custom deal for pages any company admin opens (null before migration 0015 has run). */
export async function findCustomPlan(tx: Tx, companyId: string): Promise<CustomPlan | null> {
  try {
    return await tx.transaction((sp) => getCustomPlan(sp, companyId));
  } catch (err) {
    if (missingTable(err)) return null;
    throw err;
  }
}
