import { and, eq } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { companyPortals, type Tx } from '@orbit/db';

// Project documents (from the Sales portal) are readable by everyone in the company while the
// company has Sales switched on: engineering, purchase and planning see what the customer sent.

export const PROJECT_DOCS_HREF = '/manage/project-docs';

export async function projectDocsOn(tx: Tx, ctx: SessionContext) {
  const [r] = await tx
    .select({ enabled: companyPortals.enabled })
    .from(companyPortals)
    .where(and(eq(companyPortals.companyId, ctx.companyId), eq(companyPortals.portal, 'sales')));
  return r?.enabled === true;
}
