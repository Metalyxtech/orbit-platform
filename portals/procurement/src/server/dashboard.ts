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
