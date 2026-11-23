import type { SessionContext } from '@orbit/core';
import type { Tx } from '@orbit/db';
import { OPEN_STAGES, WORK, roleLabel, stageLabel, type Stage } from '../config';
import { r2 } from '../engine';
import { listRequests } from './requests';
import { loadConfig, myRole, today } from './shared';
import { listItems } from './stock';

/** Dashboard numbers for the signed-in person, plus the company pipeline. */
export async function dashboard(tx: Tx, ctx: SessionContext) {
  const [cfg, me, all, items] = await Promise.all([loadConfig(tx, ctx.companyId), myRole(tx, ctx), listRequests(tx, ctx, { filter: 'all' }), listItems(tx, ctx)]);
  const month = today(ctx).slice(0, 7);
  const open = all.filter((r) => OPEN_STAGES.includes(r.stage));
  const stages: Stage[] = [...WORK.filter((k) => !(k in cfg.flow) || cfg.flow[k as keyof typeof cfg.flow]), 'stock_issue'];
  return {
    me,
    meLabel: roleLabel(me),
    currency: cfg.money.currency,
    kpis: {
      open: open.length,
      mine: all.filter((r) => r.actionable).length,
      late: open.filter((r) => r.late).length,
      poMonth: r2(all.filter((r) => r.poDate?.startsWith(month)).reduce((t, r) => t + r.value, 0)),
      stockValue: r2(items.reduce((t, i) => t + i.value, 0)),
      low: items.filter((i) => i.state !== 'ok').length,
    },
    pipeline: stages.map((s) => ({ stage: s, label: stageLabel(cfg, s), count: open.filter((r) => r.stage === s).length, value: r2(open.filter((r) => r.stage === s).reduce((t, r) => t + r.value, 0)) })),
    queue: all.filter((r) => r.actionable).sort((a, b) => b.daysInStage - a.daysInStage).slice(0, 8),
    myRequests: all.filter((r) => r.mine).slice(0, 6),
    low: items.filter((i) => i.state !== 'ok').slice(0, 8),
  };
}

/** Management view: pipeline, approvals waiting, spend by supplier and project, stock health. */
export async function managementView(tx: Tx, ctx: SessionContext) {
  const d = await dashboard(tx, ctx);
  const all = await listRequests(tx, ctx, { filter: 'all' });
  const waiting = all.filter((r) => r.stage === 'pr_approval' || r.stage === 'po_approval');
  const ordered = all.filter((r) => r.poNo);
  const group = (key: (r: (typeof all)[number]) => string) => {
    const m = new Map<string, number>();
    for (const r of ordered) m.set(key(r), r2((m.get(key(r)) ?? 0) + r.value));
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  };
  return {
    ...d,
    waiting: waiting.sort((a, b) => b.daysInStage - a.daysInStage),
    bySupplier: group((r) => r.supplier ?? 'Unknown'),
    byProject: group((r) => r.project),
    late: all.filter((r) => r.late),
  };
}

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
const monthShort = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

/** Purchase charts for managers and management: month comparison, spend, pipeline, approvals. */
export async function overviewCharts(tx: Tx, ctx: SessionContext) {
  const m = await managementView(tx, ctx);
  const all = await listRequests(tx, ctx, { filter: 'all' });
  const month = today(ctx).slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
  const stat = (mo: string) => {
    const raised = all.filter((r) => r.createdAt.slice(0, 7) === mo);
    const ordered = all.filter((r) => r.poDate?.startsWith(mo));
    const closed = all.filter((r) => r.stage === 'closed' && r.stageAt.slice(0, 7) === mo);
    const toPo = ordered.map((r) => Math.max(0, (new Date(`${r.poDate}T00:00:00Z`).getTime() - new Date(r.createdAt.slice(0, 10) + 'T00:00:00Z').getTime()) / 864e5));
    return {
      label: monthShort(mo),
      raised: raised.length,
      requested: r2(raised.reduce((t, r) => t + r.value, 0)),
      orderedValue: r2(ordered.reduce((t, r) => t + r.value, 0)),
      orders: ordered.length,
      closed: closed.length,
      daysToPo: toPo.length ? Math.round((toPo.reduce((a, b) => a + b, 0) / toPo.length) * 10) / 10 : 0,
    };
  };
  const series = months.map(stat);
  const byOwner = new Map<string, { onTime: number; late: number }>();
  for (const r of m.waiting) {
    const k = r.owner ?? 'Nobody';
    const v = byOwner.get(k) ?? { onTime: 0, late: 0 };
    if (r.daysInStage > 2) v.late++;
    else v.onTime++;
    byOwner.set(k, v);
  }
  return {
    currency: m.currency,
    now: series[5],
    before: series[4],
    months: series,
    pipeline: m.pipeline,
    bySupplier: m.bySupplier,
    byProject: m.byProject,
    approvers: [...byOwner.entries()].map(([label, v]) => ({ label, ...v })),
    stock: { value: m.kpis.stockValue, low: m.low.length },
  };
}
