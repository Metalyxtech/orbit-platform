import { and, desc, eq } from 'drizzle-orm';
import { getDb, getSession } from '@orbit/core/next';
import { companyPortals, workflowDefinitionColumns, workflowDefinitions, type Tx } from '@orbit/db';
import { timesheetManifest } from '@orbit/portal-timesheet/manifest';

// Shared by the Super Admin server actions. Not a 'use server' file, so nothing here is callable from the browser.

/** Returns the Super Admin's user id, or throws for anyone else. */
export async function requireSuperAdmin() {
  const s = await getSession();
  const isSuper = (s.state === 'ok' && s.ctx.isSuperAdmin) || ((s.state === 'no_company' || s.state === 'pending') && s.isSuperAdmin);
  if (!isSuper) throw new Error('Super Admin only');
  return s.state === 'ok' ? s.ctx.userId : s.state === 'no_company' ? s.userId : '00000000-0000-0000-0000-000000000000';
}

async function defaultWorkflowId(portal: string) {
  if (portal !== timesheetManifest.id) return null;
  const db = await getDb();
  const [wf] = await db
    .select(workflowDefinitionColumns)
    .from(workflowDefinitions)
    .where(eq(workflowDefinitions.key, timesheetManifest.defaultWorkflowKey))
    .orderBy(desc(workflowDefinitions.version))
    .limit(1);
  return wf?.id ?? null;
}

/** Switches one portal on or off for a company. Switching on keeps an existing workflow choice. */
export async function setPortal(tx: Tx, companyId: string, portal: string, enabled: boolean) {
  const [row] = await tx
    .select({ workflowDefinitionId: companyPortals.workflowDefinitionId })
    .from(companyPortals)
    .where(and(eq(companyPortals.companyId, companyId), eq(companyPortals.portal, portal)));
  const workflowDefinitionId = row?.workflowDefinitionId ?? (enabled ? await defaultWorkflowId(portal) : null);
  await tx
    .insert(companyPortals)
    .values({ companyId, portal, enabled, workflowDefinitionId })
    .onConflictDoUpdate({ target: [companyPortals.companyId, companyPortals.portal], set: { enabled, workflowDefinitionId } });
}

