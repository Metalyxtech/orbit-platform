import { and, desc, eq, inArray } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { auditLog, memberships, users, type Tx } from '@orbit/db';

export type ChangeArea = 'Purchase' | 'Timesheet' | 'Sales' | 'Production' | 'Quality' | 'People and access' | 'GM control' | 'Company';

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
  'sales.settings': { area: 'Sales', label: 'Sales settings changed' },
  'sales.role': { area: 'Sales', label: 'Sales role changed' },
  'sales.targets': { area: 'Sales', label: 'Sales targets changed' },
  'sales.customer.add': { area: 'Sales', label: 'Customer added' },
  'sales.enquiry.create': { area: 'Sales', label: 'Enquiry created' },
  'sales.enquiry.costing': { area: 'Sales', label: 'Enquiry sent for costing' },
  'sales.enquiry.priced': { area: 'Sales', label: 'Pricing done' },
  'sales.enquiry.reopen': { area: 'Sales', label: 'Priced enquiry reopened' },
  'sales.enquiry.won': { area: 'Sales', label: 'Enquiry won' },
  'sales.enquiry.lost': { area: 'Sales', label: 'Enquiry lost' },
  'sales.quote.ask': { area: 'Sales', label: 'Discount approval asked' },
  'sales.quote.approve': { area: 'Sales', label: 'Discount approved' },
  'sales.quote.reject': { area: 'Sales', label: 'Discount sent back' },
  'sales.quote.send': { area: 'Sales', label: 'Quotation sent' },
  'sales.order.confirm': { area: 'Sales', label: 'Sales order confirmed' },
  'sales.order.status': { area: 'Sales', label: 'Sales order moved on' },
  'sales.invoice.raise': { area: 'Sales', label: 'Invoice raised' },
  'sales.payment': { area: 'Sales', label: 'Payment recorded' },
  'production.settings': { area: 'Production', label: 'Production settings changed' },
  'production.role': { area: 'Production', label: 'Production role changed' },
  'production.wo.create': { area: 'Production', label: 'Work order planned' },
  'production.wo.submit': { area: 'Production', label: 'Work order sent for release' },
  'production.wo.release': { area: 'Production', label: 'Work order released' },
  'production.wo.return': { area: 'Production', label: 'Work order sent back' },
  'production.wo.cancel': { area: 'Production', label: 'Work order cancelled' },
  'production.wo.start': { area: 'Production', label: 'Production started' },
  'production.wo.final_qc': { area: 'Production', label: 'Ready for final QC' },
  'production.wo.complete': { area: 'Production', label: 'Work order completed' },
  'production.wo.dispatch': { area: 'Production', label: 'Work order dispatched' },
  'production.store.issue': { area: 'Production', label: 'Material issued' },
  'production.qc.pass': { area: 'Production', label: 'QC passed' },
  'production.qc.fail': { area: 'Production', label: 'QC failed, NCR raised' },
  'production.drawing.add': { area: 'Production', label: 'Drawing attached' },
  'production.drawing.remove': { area: 'Production', label: 'Drawing removed' },
  'production.ncr.close': { area: 'Production', label: 'NCR closed' },
  'production.mr.create': { area: 'Production', label: 'Material requested' },
  'production.mr.issue': { area: 'Production', label: 'Material issued from the production store' },
  'production.mr.ask': { area: 'Production', label: 'Material asked from Purchase' },
  'production.mr.approve': { area: 'Production', label: 'Material request approved' },
  'production.mr.reject': { area: 'Production', label: 'Material request sent back' },
  'production.mr.cancel': { area: 'Production', label: 'Material request cancelled' },
  'production.mr.delivery': { area: 'Production', label: 'Material received at the production store' },
  'production.stock.adjust': { area: 'Production', label: 'Production stock adjusted' },
  'control.hold': { area: 'GM control', label: 'Process stopped (on hold)' },
  'control.release': { area: 'GM control', label: 'Process resumed' },
  'control.comment': { area: 'GM control', label: 'Comment on a process' },
  'team.save': { area: 'People and access', label: 'Project team changed' },
  'quality.report.pass': { area: 'Quality', label: 'Inspection passed' },
  'quality.report.fail': { area: 'Quality', label: 'Inspection failed, NCR raised' },
  'quality.report.return': { area: 'Quality', label: 'Report sent back to QC engineer' },
  'quality.report.approve': { area: 'Quality', label: 'Inspection report approved' },
  'quality.role': { area: 'Quality', label: 'Quality role changed' },
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
