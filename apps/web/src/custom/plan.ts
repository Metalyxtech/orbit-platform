import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { customPlans, type Tx } from '@orbit/db';

// A custom customer's deal, set by Super Admin: switched on, label, monthly / yearly price, people.

export type CustomPlan = typeof customPlans.$inferSelect;
export type CustomCycle = 'monthly' | 'yearly';

/** The company's custom deal, or null when it is a normal customer. */
export async function getCustomPlan(tx: Tx, companyId: string): Promise<CustomPlan | null> {
  const [row] = await tx.select().from(customPlans).where(eq(customPlans.companyId, companyId));
  return row ?? null;
}

/** True when Super Admin has made this company a custom customer. */
export async function isCustomCompany(tx: Tx, companyId: string) {
  return (await getCustomPlan(tx, companyId))?.enabled ?? false;
}

/** The price for one cycle in the company's currency (whole rupees or dollars), or null if not offered. */
export const customPrice = (p: Pick<CustomPlan, 'monthlyPrice' | 'yearlyPrice'>, cycle: CustomCycle) => (cycle === 'yearly' ? p.yearlyPrice : p.monthlyPrice);

const money = z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().positive().max(100_000_000).nullable());
export const customPlanInput = z.object({
  enabled: z.boolean(),
  label: z.string().trim().min(2).max(120),
  monthlyPrice: money,
  yearlyPrice: money,
  maxUsers: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().positive().max(1_000_000).nullable()),
  note: z.string().trim().max(2000).optional(),
});

/** Super Admin saves the deal. */
export async function saveCustomPlan(tx: Tx, companyId: string, raw: z.input<typeof customPlanInput>) {
  const v = customPlanInput.parse(raw);
  const values = { enabled: v.enabled, label: v.label, monthlyPrice: v.monthlyPrice, yearlyPrice: v.yearlyPrice, maxUsers: v.maxUsers, note: v.note || null };
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

/**
 * For the menu: is this a custom customer? Safe before migration 0015 has run (answers false).
 * Called for company admins only, so other people pay nothing for it.
 */
export async function showCustomMenu(tx: Tx, ctx: { role: string; companyId: string }) {
  if (ctx.role !== 'company_admin') return false;
  try {
    return await tx.transaction((sp) => isCustomCompany(sp, ctx.companyId));
  } catch (err) {
    if (missingTable(err)) return false;
    throw err;
  }
}

/** The custom deal for pages any company admin opens (null before migration 0015 has run). */
export async function findCustomPlan(tx: Tx, companyId: string): Promise<CustomPlan | null> {
  try {
    return await tx.transaction((sp) => getCustomPlan(sp, companyId));
  } catch (err) {
    if (missingTable(err)) return null;
    throw err;
  }
}
