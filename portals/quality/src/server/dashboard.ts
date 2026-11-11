import { and, desc, eq, gte } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { qcInspections, type Tx } from '@orbit/db';
import { hoursBetween, type QcSource } from '../config';
import { myRole, peopleById } from './shared';

// Quality dashboard for the QC manager and GM: work in hand, results, turnaround, trends and
// the parties (suppliers, customers' jobs) with the most failures.

export async function dashboard(tx: Tx, ctx: SessionContext) {
  const me = await myRole(tx, ctx);
  const since = new Date(Date.now() - 183 * 86_400_000);
  const rows = await tx.select().from(qcInspections).where(and(eq(qcInspections.companyId, ctx.companyId), gte(qcInspections.createdAt, since))).orderBy(desc(qcInspections.createdAt));
  const final = rows.filter((r) => r.status === 'approved');
  const m0 = new Date();
  m0.setUTCDate(1);
  m0.setUTCHours(0, 0, 0, 0);
  const month = final.filter((r) => r.approvedAt && r.approvedAt >= m0);
  const passed = (list: typeof rows) => list.filter((r) => r.result === 'pass').length;
  const turn = final.filter((r) => r.approvedAt).map((r) => hoursBetween(r.createdAt, r.approvedAt!));
  const avgTurn = turn.length ? Math.round((turn.reduce((a, b) => a + b, 0) / turn.length) * 10) / 10 : null;

  // Last six months: pass and fail per month.
  const months: { key: string; label: string; pass: number; fail: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    const list = final.filter((r) => r.approvedAt?.toISOString().slice(0, 7) === key);
    months.push({ key, label: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }), pass: passed(list), fail: list.length - passed(list) });
  }
  const bySource = (['purchase', 'production'] as QcSource[]).map((s) => {
    const list = final.filter((r) => r.source === s);
    return { source: s, total: list.length, pass: passed(list), open: rows.filter((r) => r.source === s && (r.status === 'pending' || r.status === 'submitted')).length };
  });
  // Parties with failures (suppliers for purchase, customers for production).
  const fails = new Map<string, { party: string; source: QcSource; fail: number; total: number }>();
  for (const r of final) {
    const k = `${r.source}:${r.party ?? '-'}`;
    const x = fails.get(k) ?? { party: r.party ?? '-', source: r.source as QcSource, fail: 0, total: 0 };
    x.total++;
    if (r.result === 'fail') x.fail++;
    fails.set(k, x);
  }
  const recent = final.slice(0, 8);
  const people = await peopleById(tx, recent.flatMap((r) => [r.inspectorId, r.approverId]));
  return {
    me,
    kpi: {
      pending: rows.filter((r) => r.status === 'pending').length,
      submitted: rows.filter((r) => r.status === 'submitted').length,
      month: month.length,
      monthPass: month.length ? Math.round((passed(month) / month.length) * 100) : null,
      passRate: final.length ? Math.round((passed(final) / final.length) * 100) : null,
      avgTurn,
      reinspections: rows.filter((r) => r.round > 1).length,
    },
    months,
    bySource,
    worst: [...fails.values()].filter((x) => x.fail > 0).sort((a, b) => b.fail - a.fail || b.total - a.total).slice(0, 6),
    recent: recent.map((r) => ({ id: r.id, number: r.number, source: r.source as QcSource, sourceRef: r.sourceRef, title: r.title, party: r.party, result: r.result as 'pass' | 'fail', inspector: r.inspectorId ? (people.get(r.inspectorId) ?? '') : '', approver: r.approverId ? (people.get(r.approverId) ?? '') : '', approvedAt: r.approvedAt?.toISOString() ?? null })),
  };
}
export type QcDashboard = Awaited<ReturnType<typeof dashboard>>;
