import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { companyPortals, qcEvents, qcInspections, qcSettings, type Tx } from '@orbit/db';
import type { ActionContext } from './session';

// The contract between the Quality portal and the portals that need inspections.
// Purchase and Production call requestInspection() when material arrives or work is finished;
// the Quality portal calls applyQualityDecision() when the QC manager gives final approval, and
// the source portal's registered handler moves its own record on. No portal imports another.

export const QUALITY_PORTAL = 'quality';
export type QcSource = 'purchase' | 'production';

export interface InspectionRequest {
  source: QcSource;
  sourceId: string;
  /** PO / PR / WO number shown to QC. */
  sourceRef: string;
  title: string;
  /** Supplier (purchase) or customer (production). */
  party?: string | null;
  details: { label: string; value: string }[];
  items: { item: string; qty: number; unit: string }[];
  checklist: string[];
  /** Files QC opens. URLs are app routes that check access (QC users are allowed). */
  documents: { name: string; url: string }[];
}

export interface QualityDecision {
  source: QcSource;
  sourceId: string;
  inspectionId: string;
  number: string;
  result: 'pass' | 'fail';
  ncr: string | null;
  remarks: string | null;
  approverNote: string | null;
}

/** True when the company has the Quality portal switched on: inspections then go to QC. */
export async function qualityOn(tx: Tx, companyId: string) {
  const [r] = await tx
    .select({ enabled: companyPortals.enabled })
    .from(companyPortals)
    .where(and(eq(companyPortals.companyId, companyId), eq(companyPortals.portal, QUALITY_PORTAL)));
  return r?.enabled === true;
}

const OPEN = ['pending', 'submitted'];

/** Raises an inspection for QC (re-inspections count up the round). Returns the report number. */
export async function requestInspection(tx: Tx, ctx: ActionContext, req: InspectionRequest) {
  const [open] = await tx
    .select({ id: qcInspections.id, number: qcInspections.number })
    .from(qcInspections)
    .where(and(eq(qcInspections.companyId, ctx.companyId), eq(qcInspections.source, req.source), eq(qcInspections.sourceId, req.sourceId), inArray(qcInspections.status, OPEN)));
  if (open) return open; // already with QC
  const [{ n }] = await tx
    .select({ n: count() })
    .from(qcInspections)
    .where(and(eq(qcInspections.companyId, ctx.companyId), eq(qcInspections.source, req.source), eq(qcInspections.sourceId, req.sourceId)));
  await tx.insert(qcSettings).values({ companyId: ctx.companyId }).onConflictDoNothing();
  const [s] = await tx
    .update(qcSettings)
    .set({ seq: sql`${qcSettings.seq} + 1` })
    .where(eq(qcSettings.companyId, ctx.companyId))
    .returning({ seq: qcSettings.seq });
  const number = `IR-${String(s.seq).padStart(4, '0')}`;
  const [row] = await tx
    .insert(qcInspections)
    .values({
      companyId: ctx.companyId,
      number,
      source: req.source,
      sourceId: req.sourceId,
      sourceRef: req.sourceRef,
      title: req.title,
      party: req.party ?? null,
      details: req.details,
      items: req.items,
      checklist: req.checklist.length ? req.checklist : ['As per specification / purchase order'],
      documents: req.documents,
      round: n + 1,
      requestedBy: ctx.membershipId,
    })
    .returning({ id: qcInspections.id, number: qcInspections.number });
  await tx.insert(qcEvents).values({ companyId: ctx.companyId, inspectionId: row.id, text: `${n ? `Re-inspection (round ${n + 1})` : 'Inspection'} requested from ${req.source === 'purchase' ? 'Purchase' : 'Production'}: ${req.sourceRef}`, byId: ctx.membershipId });
  return row;
}

/** The latest inspection for a purchase request or work order (for showing its QC status). */
export async function latestInspection(tx: Tx, companyId: string, source: QcSource, sourceId: string) {
  try {
    return await tx.transaction(async (sp) => {
      const rows = await sp
        .select({ id: qcInspections.id, number: qcInspections.number, status: qcInspections.status, result: qcInspections.result, ncr: qcInspections.ncr, remarks: qcInspections.remarks, round: qcInspections.round, approvedAt: qcInspections.approvedAt })
        .from(qcInspections)
        .where(and(eq(qcInspections.companyId, companyId), eq(qcInspections.source, source), eq(qcInspections.sourceId, sourceId)));
      return rows.sort((a, b) => b.round - a.round)[0] ?? null;
    });
  } catch {
    return null; // migration 0025 not run yet
  }
}

type Handler = (tx: Tx, ctx: ActionContext, d: QualityDecision) => Promise<void>;
// Kept on globalThis so every bundle that loads this module shares one registry.
const KEY = Symbol.for('orbit.quality.handlers');
const registry = ((globalThis as Record<symbol, unknown>)[KEY] ??= new Map<QcSource, Handler>()) as Map<QcSource, Handler>;

/** A source portal says what happens to its record when QC gives final approval. */
export function onQualityDecision(source: QcSource, handler: Handler) {
  registry.set(source, handler);
}

/** Called by the Quality portal inside the approval transaction. */
export async function applyQualityDecision(tx: Tx, ctx: ActionContext, d: QualityDecision) {
  const handler = registry.get(d.source);
  if (!handler) throw new Error(`Orbit cannot reach the ${d.source} portal right now. Try again in a moment.`);
  await handler(tx, ctx, d);
}
