import { eq } from 'drizzle-orm';
import { companyProfile, type Queryable } from '@orbit/db';

/**
 * Company type. 'manufacturing': steel fabrication, piping and project companies (the original set).
 * 'production': machining, moulding and press tool shops. It decides which portals, forms and
 * subscription plans a company sees. Chosen when the company is added; Super Admin can change it.
 */
export type Industry = 'manufacturing' | 'production';

export const INDUSTRIES: { id: Industry; name: string; detail: string }[] = [
  { id: 'manufacturing', name: 'Manufacturing', detail: 'Steel fabrication, piping, sheet metal and project companies' },
  { id: 'production', name: 'Production', detail: 'Machining, moulding and press tool shops' },
];

export const isIndustry = (v: unknown): v is Industry => v === 'manufacturing' || v === 'production';
export const industryName = (i: Industry) => INDUSTRIES.find((x) => x.id === i)?.name ?? i;

const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;

/** The company's type; manufacturing when not set (or before migration 0035 has run). */
export async function companyIndustry(tx: Queryable, companyId: string): Promise<Industry> {
  try {
    const [row] = await tx.transaction((sp) => sp.select({ industry: companyProfile.industry }).from(companyProfile).where(eq(companyProfile.companyId, companyId)));
    return isIndustry(row?.industry) ? row.industry : 'manufacturing';
  } catch (err) {
    if (pgCode(err) === '42P01' || /relation "company_profile" does not exist/.test(String(err))) return 'manufacturing';
    throw err;
  }
}

export async function setCompanyIndustry(tx: Queryable, companyId: string, industry: Industry) {
  await tx
    .insert(companyProfile)
    .values({ companyId, industry })
    .onConflictDoUpdate({ target: companyProfile.companyId, set: { industry, updatedAt: new Date() } });
}
