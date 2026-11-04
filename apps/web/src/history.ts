import { and, desc, eq, inArray } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { auditLog, memberships, users, type Tx } from '@orbit/db';

export type ChangeArea = 'Purchase' | 'Timesheet' | 'People and access' | 'Company';

/** Plain-language name and area for each recorded action. */
const ACTIONS: Record<string, { area: ChangeArea; label: string }> = {
  'procurement.template': { area: 'Purchase', label: 'Industry form applied' },
  'procurement.workflow': { area: 'Purchase', label: 'Purchase workflow changed' },
  'procurement.form': { area: 'Purchase', label: 'Requisition form changed' },
  'procurement.levels': { area: 'Purchase', label: 'Approval rules changed' },
  'procurement.money': { area: 'Purchase', label: 'Money and numbering changed' },
  'procurement.check.add': { area: 'Purchase', label: 'Industry check added' },
  'procurement.check.remove': { area: 'Purchase', label: 'Industry check removed' },
  'procurement.covers': { area: 'Purchase', label: 'Admin role cover changed' },
  'procurement.role': { area: 'Purchase', label: 'Purchase role changed' },
  'procurement.supplier.add': { area: 'Purchase', label: 'Supplier added' },
  'procurement.item.add': { area: 'Purchase', label: 'Stock item added' },
  'procurement.request.create': { area: 'Purchase', label: 'Requisition raised' },
  'workflow.bind': { area: 'Timesheet', label: 'Timesheet approval workflow changed' },
  'ts_settings.update': { area: 'Timesheet', label: 'Timesheet settings changed' },
  'timesheet.form': { area: 'Timesheet', label: 'Timesheet form changed' },
  'timesheet.correction_approved': { area: 'Timesheet', label: 'Timesheet correction approved' },
  'cost_codes.import_csv': { area: 'Timesheet', label: 'Projects and cost codes imported' },
  'membership.add': { area: 'People and access', label: 'Person added' },
  'membership.update': { area: 'People and access', label: 'Person updated' },
  'membership.approve': { area: 'People and access', label: 'Person approved' },
  'membership.remove': { area: 'People and access', label: 'Person removed' },
  'member_portal.grant': { area: 'People and access', label: 'Portal access given' },
  'member_portal.request': { area: 'People and access', label: 'Portal access given' },
  'member_portal.remove': { area: 'People and access', label: 'Portal access removed' },
  'member_portal.cancel': { area: 'People and access', label: 'Portal request cancelled' },
  'company_portal.request': { area: 'Company', label: 'Portal requested from Orbit' },
  'company_portal.cancel': { area: 'Company', label: 'Portal request withdrawn' },
  'company.approve': { area: 'Company', label: 'Company approved by Orbit' },
  'portal.decline': { area: 'Company', label: 'Portal declined by Orbit' },
};

const describe = (data: unknown): string[] => {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.summary)) return d.summary.map(String);
  return Object.entries(d)
    .filter(([, v]) => v != null && typeof v !== 'object')
    .slice(0, 6)
    .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${String(v)}`);
};

/** Recent changes in the company (admin and management), newest first. */
export async function listChanges(tx: Tx, ctx: SessionContext, opts: { area?: ChangeArea } = {}) {
  if (ctx.role !== 'company_admin' && ctx.role !== 'management') throw new Error('Only admins and management can see the change history');
  const rows = await tx.select().from(auditLog).where(eq(auditLog.companyId, ctx.companyId)).orderBy(desc(auditLog.at)).limit(400);
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const people = actorIds.length
    ? await tx
        .select({ id: memberships.id, name: users.name, title: memberships.title })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.companyId, ctx.companyId), inArray(memberships.id, actorIds)))
    : [];
  return rows
    .map((r) => {
      const known = ACTIONS[r.action] ?? { area: 'Company' as ChangeArea, label: r.action.replace(/[._]/g, ' ') };
      const who = people.find((p) => p.id === r.actorId);
      return { id: r.id, at: r.at.toISOString(), area: known.area, label: known.label, who: who?.name ?? (r.actorId ? 'Someone' : 'Orbit'), whoTitle: who?.title ?? null, details: describe(r.data) };
    })
    .filter((r) => !opts.area || r.area === opts.area);
}
export type ChangeRow = Awaited<ReturnType<typeof listChanges>>[number];
