import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { prodEvents, prodReports, prodWorkOrders, type Tx } from '@orbit/db';
import { MR_FLOW, MR_STATUS, WO_FLOW, WO_STATUS } from '../config';
import { openMrCounts } from './mr';
import { tradeOf } from '../trades';
import { listWorkOrders } from './workorders';
import { myRole, peopleById, today } from './shared';

// Dashboard: work in hand, delays, output and quality.

export async function dashboard(tx: Tx, ctx: SessionContext) {
  const me = await myRole(tx, ctx);
  const t0 = today();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const [open, todayRep, week, events] = await Promise.all([
    listWorkOrders(tx, ctx, { filter: 'open' }),
    tx.select({ hours: sql<number>`coalesce(sum(${prodReports.hours}), 0)::float`, lines: sql<number>`count(*)::int`, workers: sql<number>`coalesce(sum(${prodReports.workers}), 0)::int` }).from(prodReports).where(and(eq(prodReports.companyId, ctx.companyId), eq(prodReports.day, t0))),
    tx
      .select({ trade: prodWorkOrders.trade, hours: sql<number>`coalesce(sum(${prodReports.hours}), 0)::float` })
      .from(prodReports)
      .innerJoin(prodWorkOrders, eq(prodWorkOrders.id, prodReports.workOrderId))
      .where(and(eq(prodReports.companyId, ctx.companyId), gte(prodReports.day, weekAgo)))
      .groupBy(prodWorkOrders.trade),
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
  // Charts: hours reported per day (14 days) and open material requests by where they are.
  const from = new Date(Date.now() - 13 * 86_400_000).toISOString().slice(0, 10);
  const perDay = await tx
    .select({ day: prodReports.day, hours: sql<number>`coalesce(sum(${prodReports.hours}), 0)::float`, lines: sql<number>`count(*)::int` })
    .from(prodReports)
    .where(and(eq(prodReports.companyId, ctx.companyId), gte(prodReports.day, from)))
    .groupBy(prodReports.day);
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10));
  const mrs = await tx.transaction((sp) => openMrCounts(sp, ctx)).catch((): { status: keyof typeof MR_STATUS; workOrderId: string }[] => []);
  const mrOf = (id: string) => mrs.filter((m) => m.workOrderId === id);
  return {
    me,
    kpi: {
      open: open.length,
      floor: open.filter((w) => w.status === 'released' || w.status === 'in_progress').length,
      late: open.filter((w) => w.late).length,
      qc: open.filter((w) => w.status === 'final_qc').length,
      rework: open.filter((w) => w.rework).length,
      ready: ready.length,
      hoursToday: todayRep[0]?.hours ?? 0,
      reportsToday: todayRep[0]?.lines ?? 0,
    },
    pipeline: WO_FLOW.filter((s) => s !== 'dispatched').map((s) => ({ id: s, label: WO_STATUS[s].label, count: s === 'completed' ? ready.length : open.filter((w) => w.status === s).length })),
    attention: open.filter((w) => w.late || w.rework || w.priority === 'urgent').slice(0, 10),
    hoursByTrade: week.map((w) => ({ trade: tradeOf(w.trade).name, hours: w.hours })).sort((a, b) => b.hours - a.hours),
    hoursByDay: days.map((d) => ({ day: d, hours: perDay.find((p) => p.day === d)?.hours ?? 0 })),
    mrByStatus: MR_FLOW.filter((s) => s !== 'issued').map((s) => ({ id: s, label: MR_STATUS[s].label, count: mrs.filter((m) => m.status === s).length })),
    /** Every open work order with its material position, most urgent first. */
    orders: open
      .map((w) => {
        const m = mrOf(w.id);
        const buying = m.filter((x) => x.status === 'purchase').length;
        return {
          ...w,
          openRequests: m.length,
          material: !m.length ? ('ok' as const) : buying ? ('purchase' as const) : m.some((x) => x.status === 'ready') ? ('arrived' as const) : ('store' as const),
        };
      })
      .sort((a, b) => Number(b.late) - Number(a.late) || (a.due ?? '9999').localeCompare(b.due ?? '9999')),
    recent: events.map((e) => ({ id: e.id, text: e.text, at: e.at.toISOString(), by: e.byId ? (people.get(e.byId) ?? '') : '', woId: e.woId, number: e.number })),
  };
}
