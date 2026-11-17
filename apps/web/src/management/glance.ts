import { and, eq, gte, inArray } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { procRequests, prodWorkOrders, qcInspections, salesEnquiries, timesheets, type Tx } from '@orbit/db';
import { portalModules } from '../portals';

// The company at a glance for the GM: for each portal the company has, how much work is open,
// how much of it is past its date, and how much new work started in each of the last six months.
// Each portal is read in its own savepoint, so one that is not set up yet just shows nothing.

export type PortalGlance = { portal: string; name: string; unit: string; open: number; late: number; months: number[] };

const COLORS: Record<string, string> = { timesheet: '#2f5d8a', sales: '#e07b39', procurement: '#3a9a6b', production: '#8b5fbf', quality: '#c94f6d' };
export const portalColor = (p: string) => COLORS[p] ?? '#9aa3ab';

const day = () => new Date().toISOString().slice(0, 10);

export async function companyGlance(tx: Tx, ctx: SessionContext, portals: string[]) {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const keys = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1)));
  const labels = keys.map((d) => d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }));
  const perMonth = (dates: (Date | null)[]) => keys.map((k) => dates.filter((d) => d && d.toISOString().slice(0, 7) === k.toISOString().slice(0, 7)).length);
  const t0 = day();
  const c = ctx.companyId;

  const readers: Record<string, () => Promise<Omit<PortalGlance, 'portal' | 'name'>>> = {
    timesheet: async () => {
      const rows = await tx.select({ status: timesheets.status, at: timesheets.submittedAt }).from(timesheets).where(and(eq(timesheets.companyId, c), gte(timesheets.weekStart, first.toISOString().slice(0, 10))));
      return { unit: 'timesheets in approval', open: rows.filter((r) => r.status === 'in_approval').length, late: 0, months: perMonth(rows.map((r) => r.at)) };
    },
    sales: async () => {
      const open = await tx.select({ followUp: salesEnquiries.followUp }).from(salesEnquiries).where(and(eq(salesEnquiries.companyId, c), inArray(salesEnquiries.stage, ['enquiry', 'costing', 'quoted', 'negotiation'])));
      const made = await tx.select({ at: salesEnquiries.createdAt }).from(salesEnquiries).where(and(eq(salesEnquiries.companyId, c), gte(salesEnquiries.createdAt, first)));
      return { unit: 'open enquiries', open: open.length, late: open.filter((r) => r.followUp && r.followUp < t0).length, months: perMonth(made.map((r) => r.at)) };
    },
    procurement: async () => {
      const open = await tx.select({ needBy: procRequests.needBy }).from(procRequests).where(and(eq(procRequests.companyId, c), inArray(procRequests.stage, ['stock_check', 'pr_approval', 'rfq', 'po_approval', 'issue', 'receiving', 'inspection', 'invoice', 'stock_issue'])));
      const made = await tx.select({ at: procRequests.createdAt }).from(procRequests).where(and(eq(procRequests.companyId, c), gte(procRequests.createdAt, first)));
      return { unit: 'open purchase requests', open: open.length, late: open.filter((r) => r.needBy < t0).length, months: perMonth(made.map((r) => r.at)) };
    },
    production: async () => {
      const open = await tx.select({ due: prodWorkOrders.due }).from(prodWorkOrders).where(and(eq(prodWorkOrders.companyId, c), inArray(prodWorkOrders.status, ['draft', 'pending_release', 'released', 'in_progress', 'final_qc'])));
      const made = await tx.select({ at: prodWorkOrders.createdAt }).from(prodWorkOrders).where(and(eq(prodWorkOrders.companyId, c), gte(prodWorkOrders.createdAt, first)));
      return { unit: 'open work orders', open: open.length, late: open.filter((r) => r.due && r.due < t0).length, months: perMonth(made.map((r) => r.at)) };
    },
    quality: async () => {
      const rows = await tx.select({ status: qcInspections.status, at: qcInspections.createdAt }).from(qcInspections).where(and(eq(qcInspections.companyId, c), gte(qcInspections.createdAt, first)));
      return { unit: 'open inspections', open: rows.filter((r) => r.status === 'pending' || r.status === 'submitted').length, late: 0, months: perMonth(rows.map((r) => r.at)) };
    },
  };

  const rows: PortalGlance[] = [];
  for (const p of portals) {
    const read = readers[p];
    if (!read || !portalModules[p]) continue;
    try {
      rows.push({ portal: p, name: portalModules[p].manifest.name, ...(await tx.transaction(() => read())) });
    } catch {
      /* this portal's tables are not there yet */
    }
  }
  return { labels, rows };
}
