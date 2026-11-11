import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext, SessionContext } from '@orbit/core';
import { applyQualityDecision, type QcSource as CoreSource } from '@orbit/core/quality';
import { prodReceipts, qcEvents, qcInspections, type Tx } from '@orbit/db';
import { processThread } from '@orbit/core/holds';
import { QC_STATUS, type Finding, type QcSource, type QcStatus } from '../config';
import { hasRole, lockInspection, logEvent, myRole, peopleById, requireRole } from './shared';

// Inspections: the QC engineer inspects (checklist, readings, remarks, pass or fail with an NCR)
// and submits the report; the QC manager gives final approval or sends it back. Final approval
// tells the source portal (Purchase or Production) the result.

const reportInput = z.object({
  id: z.uuid(),
  findings: z.array(z.object({ item: z.string().max(300), ok: z.boolean(), note: z.string().trim().max(500).optional() })).min(1, 'Go through the checklist').max(80),
  extra: z.array(z.object({ item: z.string().trim().min(1).max(300), ok: z.boolean(), note: z.string().trim().max(500).optional() })).max(30).default([]),
  remarks: z.string().trim().max(4000).optional(),
  ncr: z.string().trim().max(4000).optional(),
});

/** The QC engineer submits the inspection report to the QC manager. */
export async function submitReport(tx: Tx, ctx: ActionContext, raw: z.input<typeof reportInput>) {
  const v = reportInput.parse(raw);
  requireRole(await myRole(tx, ctx), 'inspector');
  const r = await lockInspection(tx, ctx, v.id);
  if (r.status !== 'pending') throw new Error('This inspection is not waiting for the QC engineer');
  const findings: Finding[] = [...v.findings, ...v.extra];
  const pass = findings.every((f) => f.ok);
  if (!pass && (!v.ncr || v.ncr.length < 5)) throw new Error('Something failed: describe the non-conformance (NCR)');
  await tx
    .update(qcInspections)
    .set({ status: 'submitted', result: pass ? 'pass' : 'fail', findings, remarks: v.remarks || null, ncr: pass ? null : v.ncr!, inspectorId: ctx.membershipId, inspectedAt: new Date(), returnNote: null, updatedAt: new Date() })
    .where(eq(qcInspections.id, r.id));
  await logEvent(tx, ctx, r.id, `Inspected: ${pass ? 'PASS' : 'FAIL'}${pass ? '' : ` (NCR: ${v.ncr})`}. Sent to the QC manager for final approval.`, pass ? 'quality.report.pass' : 'quality.report.fail');
  return { result: pass ? ('pass' as const) : ('fail' as const) };
}

/**
 * The QC manager approves the report (final: the source portal gets the result) or sends it back
 * to the QC engineer with a note.
 */
export async function decide(tx: Tx, ctx: ActionContext, raw: { id: string; approve: boolean; note?: string }) {
  const v = z.object({ id: z.uuid(), approve: z.boolean(), note: z.string().trim().max(2000).optional() }).parse(raw);
  requireRole(await myRole(tx, ctx), 'manager');
  const r = await lockInspection(tx, ctx, v.id);
  if (r.status !== 'submitted') throw new Error('This report is not waiting for final approval');
  if (!v.approve) {
    if (!v.note) throw new Error('Say what the QC engineer should check again');
    await tx.update(qcInspections).set({ status: 'pending', returnNote: v.note, updatedAt: new Date() }).where(eq(qcInspections.id, r.id));
    await logEvent(tx, ctx, r.id, `Sent back to the QC engineer: ${v.note}`, 'quality.report.return');
    return { status: 'pending' as const };
  }
  await tx.update(qcInspections).set({ status: 'approved', approverId: ctx.membershipId, approvedAt: new Date(), approverNote: v.note || null, updatedAt: new Date() }).where(eq(qcInspections.id, r.id));
  await logEvent(tx, ctx, r.id, `Final approval: ${r.result === 'pass' ? 'PASS' : 'FAIL'}${v.note ? `. ${v.note}` : ''}`, 'quality.report.approve');
  await applyQualityDecision(tx, ctx, { source: r.source as CoreSource, sourceId: r.sourceId, inspectionId: r.id, number: r.number, result: r.result as 'pass' | 'fail', ncr: r.ncr, remarks: r.remarks, approverNote: v.note || null });
  return { status: 'approved' as const };
}

export type QcFilter = 'open' | 'pending' | 'submitted' | 'approved' | 'all';

export async function listInspections(tx: Tx, ctx: SessionContext, f: { filter?: QcFilter; source?: QcSource; q?: string; result?: 'pass' | 'fail' } = {}) {
  const conds = [eq(qcInspections.companyId, ctx.companyId)];
  const filter = f.filter ?? 'open';
  if (filter === 'open') conds.push(inArray(qcInspections.status, ['pending', 'submitted']));
  else if (filter !== 'all') conds.push(eq(qcInspections.status, filter));
  if (f.source) conds.push(eq(qcInspections.source, f.source));
  if (f.result) conds.push(eq(qcInspections.result, f.result));
  const rows = await tx.select().from(qcInspections).where(and(...conds)).orderBy(filter === 'approved' ? desc(qcInspections.approvedAt) : asc(qcInspections.createdAt)).limit(500);
  const people = await peopleById(tx, rows.flatMap((r) => [r.inspectorId, r.approverId]));
  const q = (f.q ?? '').toLowerCase();
  return rows
    .filter((r) => !q || `${r.number} ${r.sourceRef} ${r.title} ${r.party ?? ''}`.toLowerCase().includes(q))
    .map((r) => ({
      id: r.id,
      number: r.number,
      source: r.source as QcSource,
      sourceRef: r.sourceRef,
      title: r.title,
      party: r.party,
      round: r.round,
      status: r.status as QcStatus,
      statusLabel: QC_STATUS[r.status as QcStatus]?.label ?? r.status,
      result: r.result as 'pass' | 'fail' | null,
      inspector: r.inspectorId ? (people.get(r.inspectorId) ?? '') : '',
      approver: r.approverId ? (people.get(r.approverId) ?? '') : '',
      createdAt: r.createdAt.toISOString(),
      approvedAt: r.approvedAt?.toISOString() ?? null,
      waitingHours: Math.round((Date.now() - r.createdAt.getTime()) / 36e5),
    }));
}
export type QcRow = Awaited<ReturnType<typeof listInspections>>[number];

export async function inspectionDetail(tx: Tx, ctx: SessionContext, id: string) {
  const me = await myRole(tx, ctx);
  const [r] = await tx.select().from(qcInspections).where(and(eq(qcInspections.id, id), eq(qcInspections.companyId, ctx.companyId)));
  if (!r) return null;
  const [events, history] = await Promise.all([
    tx.select().from(qcEvents).where(eq(qcEvents.inspectionId, r.id)).orderBy(desc(qcEvents.createdAt)),
    tx
      .select({ id: qcInspections.id, number: qcInspections.number, round: qcInspections.round, status: qcInspections.status, result: qcInspections.result, ncr: qcInspections.ncr, approvedAt: qcInspections.approvedAt })
      .from(qcInspections)
      .where(and(eq(qcInspections.companyId, ctx.companyId), eq(qcInspections.source, r.source), eq(qcInspections.sourceId, r.sourceId)))
      .orderBy(asc(qcInspections.round)),
  ]);
  const people = await peopleById(tx, [r.inspectorId, r.approverId, r.requestedBy, ...events.map((e) => e.byId)]);
  const name = (x: string | null) => (x ? (people.get(x) ?? '') : '');
  const status = r.status as QcStatus;
  const control = await processThread(tx, ctx, 'qc_inspection', r.id);
  return {
    control,
    me,
    insp: {
      ...r,
      status,
      source: r.source as QcSource,
      details: r.details as { label: string; value: string }[],
      items: r.items as { item: string; qty: number; unit: string }[],
      checklist: r.checklist as string[],
      documents: r.documents as { name: string; url: string }[],
      findings: r.findings as Finding[],
      inspector: name(r.inspectorId),
      approver: name(r.approverId),
      requestedByName: name(r.requestedBy),
      createdAt: r.createdAt.toISOString(),
      inspectedAt: r.inspectedAt?.toISOString() ?? null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
    },
    rounds: history.map((h) => ({ ...h, approvedAt: h.approvedAt?.toISOString() ?? null })),
    events: events.map((e) => ({ id: e.id, text: e.text, by: name(e.byId), at: e.createdAt.toISOString() })),
    can: {
      inspect: status === 'pending' && hasRole(me, 'inspector'),
      approve: status === 'submitted' && hasRole(me, 'manager'),
    },
  };
}
export type QcDetail = NonNullable<Awaited<ReturnType<typeof inspectionDetail>>>;

/** Names an inspection for GM process control. */
export async function describeInspection(tx: Tx, companyId: string, id: string) {
  const [r] = await tx.select({ number: qcInspections.number, title: qcInspections.title }).from(qcInspections).where(and(eq(qcInspections.id, id), eq(qcInspections.companyId, companyId)));
  return r ? { ref: r.number, title: r.title, href: `/quality/inspection?id=${id}` } : null;
}

/** An inspection belongs to what is inspected: the purchase, the work order, or the material request a store receipt was for. */
export async function inspectionParents(tx: Tx, companyId: string, id: string) {
  const [r] = await tx.select({ source: qcInspections.source, sourceId: qcInspections.sourceId }).from(qcInspections).where(and(eq(qcInspections.id, id), eq(qcInspections.companyId, companyId)));
  if (!r) return [];
  if (r.source === 'purchase') return [{ entity: 'proc_request' as const, id: r.sourceId }];
  if (r.source === 'production') return [{ entity: 'work_order' as const, id: r.sourceId }];
  const [rc] = await tx.select({ mrId: prodReceipts.mrId, purchaseId: prodReceipts.purchaseId }).from(prodReceipts).where(eq(prodReceipts.id, r.sourceId));
  return [
    ...(rc?.mrId ? [{ entity: 'mat_request' as const, id: rc.mrId }] : []),
    ...(rc?.purchaseId ? [{ entity: 'proc_request' as const, id: rc.purchaseId }] : []),
  ];
}
