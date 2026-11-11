import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { prodEvents, prodInspections, prodNcrs, prodReports, prodWorkOrders, type Tx } from '@orbit/db';
import { WO_FLOW, WO_STATUS } from '../config';
import { tradeOf } from '../trades';
import { listWorkOrders } from './workorders';
import { myRole, peopleById, today } from './shared';

// Dashboard: work in hand, delays, output and quality.

export async function dashboard(tx: Tx, ctx: SessionContext) {
  const me = await myRole(tx, ctx);
  const t0 = today();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const [open, todayRep, week, ins, ncrOpen, events] = await Promise.all([
    listWorkOrders(tx, ctx, { filter: 'open' }),
    tx.select({ hours: sql<number>`coalesce(sum(${prodReports.hours}), 0)::float`, lines: sql<number>`count(*)::int`, workers: sql<number>`coalesce(sum(${prodReports.workers}), 0)::int` }).from(prodReports).where(and(eq(prodReports.companyId, ctx.companyId), eq(prodReports.day, t0))),
    tx
      .select({ trade: prodWorkOrders.trade, hours: sql<number>`coalesce(sum(${prodReports.hours}), 0)::float` })
      .from(prodReports)
      .innerJoin(prodWorkOrders, eq(prodWorkOrders.id, prodReports.workOrderId))
      .where(and(eq(prodReports.companyId, ctx.companyId), gte(prodReports.day, weekAgo)))
      .groupBy(prodWorkOrders.trade),
    tx.select({ result: prodInspections.result }).from(prodInspections).where(and(eq(prodInspections.companyId, ctx.companyId), gte(prodInspections.createdAt, new Date(Date.now() - 30 * 86_400_000)))),
    tx.select({ id: prodNcrs.id }).from(prodNcrs).where(and(eq(prodNcrs.companyId, ctx.companyId), eq(prodNcrs.status, 'open'))),
    tx
      .select({ id: prodEvents.id, text: prodEvents.text, at: prodEvents.createdAt, byId: prodEvents.byId, woId: prodEvents.workOrderId, number: prodWorkOrders.number })
      .from(prodEvents)
      .innerJoin(prodWorkOrders, eq(prodWorkOrders.id, prodEvents.workOrderId))
      .where(eq(prodEvents.companyId, ctx.companyId))
      .orderBy(desc(prodEvents.createdAt))
      .limit(12),
  ]);
  const ready = await tx.select({ id: prodWorkOrders.id }).from(prodWorkOrders).where(and(eq(prodWorkOrders.companyId, ctx.companyId), inArray(prodWorkOrders.status, ['completed'])));
  const people = await peopleById(tx, events.map((e) => e.byId));
  const passed = ins.filter((i) => i.result === 'pass').length;
  return {
    me,
    kpi: {
      open: open.length,
      floor: open.filter((w) => w.status === 'released' || w.status === 'in_progress').length,
      late: open.filter((w) => w.late).length,
      qc: open.filter((w) => w.status === 'final_qc').length,
      ncrs: ncrOpen.length,
      ready: ready.length,
      hoursToday: todayRep[0]?.hours ?? 0,
      reportsToday: todayRep[0]?.lines ?? 0,
      passRate: ins.length ? Math.round((passed / ins.length) * 100) : null,
    },
    pipeline: WO_FLOW.filter((s) => s !== 'dispatched').map((s) => ({ id: s, label: WO_STATUS[s].label, count: s === 'completed' ? ready.length : open.filter((w) => w.status === s).length })),
    attention: open.filter((w) => w.late || w.rework || w.openNcrs > 0 || w.priority === 'urgent').slice(0, 10),
    hoursByTrade: week.map((w) => ({ trade: tradeOf(w.trade).name, hours: w.hours })).sort((a, b) => b.hours - a.hours),
    recent: events.map((e) => ({ id: e.id, text: e.text, at: e.at.toISOString(), by: e.byId ? (people.get(e.byId) ?? '') : '', woId: e.woId, number: e.number })),
  };
}
