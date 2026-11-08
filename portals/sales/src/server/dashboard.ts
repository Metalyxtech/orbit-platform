import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { memberships, salesEnquiries, salesEvents, salesInvoices, salesOrders, users, type Tx } from '@orbit/db';
import { OPEN_STAGES, STAGES, type Stage } from '../config';
import { listEnquiries } from './enquiries';
import { hasRole, loadConfig, myRole, peopleById, today } from './shared';

// Dashboard numbers: pipeline, this month's orders against targets, money due and what needs attention.

const monthStart = () => `${today().slice(0, 7)}-01`;

export async function dashboard(tx: Tx, ctx: SessionContext) {
  const me = await myRole(tx, ctx);
  const cfg = await loadConfig(tx, ctx.companyId);
  const all = await listEnquiries(tx, ctx);
  const open = all.filter((e) => OPEN_STAGES.includes(e.stage));
  const mineOnly = me === 'exec';
  const m0 = new Date(`${monthStart()}T00:00:00Z`);
  const orderConds = [eq(salesOrders.companyId, ctx.companyId), gte(salesOrders.createdAt, m0)];
  if (mineOnly) orderConds.push(eq(salesOrders.ownerId, ctx.membershipId));
  const [ordersThisMonth, invoices, events] = await Promise.all([
    tx.select({ value: salesOrders.value, ownerId: salesOrders.ownerId }).from(salesOrders).where(and(...orderConds)),
    hasRole(me, 'accounts', 'manager', 'gm') ? tx.select({ amount: salesInvoices.amount, paid: salesInvoices.paid, due: salesInvoices.due }).from(salesInvoices).where(eq(salesInvoices.companyId, ctx.companyId)) : Promise.resolve([]),
    tx
      .select({ id: salesEvents.id, text: salesEvents.text, at: salesEvents.createdAt, byId: salesEvents.byId, enquiryId: salesEvents.enquiryId, number: salesEnquiries.number })
      .from(salesEvents)
      .innerJoin(salesEnquiries, eq(salesEnquiries.id, salesEvents.enquiryId))
      .where(and(eq(salesEvents.companyId, ctx.companyId), ...(mineOnly ? [eq(salesEnquiries.ownerId, ctx.membershipId)] : [])))
      .orderBy(desc(salesEvents.createdAt))
      .limit(12),
  ]);
  const t0 = today();
  const won = ordersThisMonth.reduce((n, o) => n + o.value, 0);
  const target = mineOnly ? (cfg.targets[ctx.membershipId] ?? 0) : Object.values(cfg.targets).reduce((n, v) => n + (v || 0), 0);
  const people = await peopleById(tx, events.map((e) => e.byId));
  return {
    me,
    cfg,
    kpi: {
      openCount: open.length,
      pipeline: open.reduce((n, e) => n + e.net, 0),
      weighted: open.reduce((n, e) => n + (e.net * e.probability) / 100, 0),
      won,
      target,
      winRate: (() => {
        const w = all.filter((e) => e.stage === 'won').length;
        const l = all.filter((e) => e.stage === 'lost').length;
        return w + l ? Math.round((w / (w + l)) * 100) : null;
      })(),
      outstanding: invoices.reduce((n, i) => n + Math.max(0, i.amount - i.paid), 0),
      overdue: invoices.filter((i) => i.due < t0).reduce((n, i) => n + Math.max(0, i.amount - i.paid), 0),
    },
    byStage: STAGES.filter((s) => OPEN_STAGES.includes(s.id)).map((s) => {
      const list = open.filter((e) => e.stage === s.id);
      return { id: s.id as Stage, label: s.label, count: list.length, value: list.reduce((n, e) => n + e.net, 0) };
    }),
    attention: open.filter((e) => e.late || e.quoteStatus === 'pending' || e.quoteStatus === 'rejected').slice(0, 8),
    recent: events.map((e) => ({ id: e.id, text: e.text, at: e.at.toISOString(), by: e.byId ? (people.get(e.byId) ?? '') : '', enquiryId: e.enquiryId, number: e.number })),
  };
}
export type Dashboard = Awaited<ReturnType<typeof dashboard>>;

/** Each salesperson's orders this month against the monthly target. */
export async function targets(tx: Tx, ctx: SessionContext) {
  const me = await myRole(tx, ctx);
  const cfg = await loadConfig(tx, ctx.companyId);
  const m0 = new Date(`${monthStart()}T00:00:00Z`);
  const [orders, people] = await Promise.all([
    tx.select({ value: salesOrders.value, ownerId: salesOrders.ownerId }).from(salesOrders).where(and(eq(salesOrders.companyId, ctx.companyId), gte(salesOrders.createdAt, m0))),
    tx.select({ id: memberships.id, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.status, 'active'))),
  ]);
  const enq = await tx.select({ ownerId: salesEnquiries.ownerId }).from(salesEnquiries).where(and(eq(salesEnquiries.companyId, ctx.companyId), inArray(salesEnquiries.stage, OPEN_STAGES)));
  const sellers = people.filter((p) => cfg.targets[p.id] !== undefined || orders.some((o) => o.ownerId === p.id) || enq.some((e) => e.ownerId === p.id));
  const rows = (me === 'exec' ? sellers.filter((p) => p.id === ctx.membershipId) : sellers)
    .map((p) => ({ membershipId: p.id, name: p.name, target: cfg.targets[p.id] ?? 0, won: orders.filter((o) => o.ownerId === p.id).reduce((n, o) => n + o.value, 0), open: enq.filter((e) => e.ownerId === p.id).length }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { me, cfg, canEdit: hasRole(me, 'manager'), rows, people: me === 'exec' ? [] : people.sort((a, b) => a.name.localeCompare(b.name)) };
}
