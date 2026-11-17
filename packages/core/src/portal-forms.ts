import { and, eq } from 'drizzle-orm';
import { portalForms, type Tx } from '@orbit/db';

const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
/** Migration 0009 not run: the portal_forms table is missing. */
const missingTable = (err: unknown) => pgCode(err) === '42P01' || /relation "portal_forms" does not exist/.test(String(err));

/** Role -> form id chosen for one portal in the current company. Empty before migration 0009. */
export async function readFormChoices(tx: Tx, companyId: string, portal: string): Promise<Record<string, string>> {
  try {
    const rows = await tx.transaction((sp) =>
      sp
        .select({ role: portalForms.role, formId: portalForms.formId })
        .from(portalForms)
        .where(and(eq(portalForms.companyId, companyId), eq(portalForms.portal, portal))),
    );
    return Object.fromEntries(rows.map((r) => [r.role, r.formId]));
  } catch (err) {
    if (missingTable(err)) return {};
    throw err;
  }
}

/** Saves the form a role uses in a portal. Returns false when migration 0009 has not run yet. */
export async function writeFormChoice(
  tx: Tx,
  v: { companyId: string; portal: string; role: string; formId: string; updatedBy: string },
): Promise<boolean> {
  try {
    await tx.transaction((sp) =>
      sp
        .insert(portalForms)
        .values(v)
        .onConflictDoUpdate({
          target: [portalForms.companyId, portalForms.portal, portalForms.role],
          set: { formId: v.formId, updatedBy: v.updatedBy, updatedAt: new Date() },
        }),
    );
    return true;
  } catch (err) {
    if (missingTable(err)) return false;
    throw err;
  }
}
