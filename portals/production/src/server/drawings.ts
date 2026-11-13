import { and, asc, count, eq, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext, SessionContext } from '@orbit/core';
import { companyKey, presignUpload } from '@orbit/core/aws';
import { prodDocs, salesDocs, salesOrders, type Tx } from '@orbit/db';
import { DRAWINGS, drawingLimit, fmtBytes } from '../config';
import { lockWo, logEvent, myRole, peopleById, requireRole } from './shared';

// Workshop drawings on a work order. The production engineer (or manager) attaches them while
// planning or later (a new revision); everyone in Production — supervisor, QC, store — opens them.

async function openFor(tx: Tx, ctx: ActionContext, workOrderId: string) {
  requireRole(await myRole(tx, ctx), 'engineer', 'manager');
  const wo = await lockWo(tx, ctx, workOrderId);
  if (['dispatched', 'cancelled'].includes(wo.status)) throw new Error('This work order is closed');
  return wo;
}

async function assertRoom(tx: Tx, workOrderId: string) {
  // Uploads that never finished (browser closed) stop counting after two hours.
  await tx.delete(prodDocs).where(and(eq(prodDocs.workOrderId, workOrderId), eq(prodDocs.uploaded, false), lt(prodDocs.createdAt, sql`now() - interval '2 hours'`)));
  const [{ n }] = await tx.select({ n: count() }).from(prodDocs).where(eq(prodDocs.workOrderId, workOrderId));
  if (n >= DRAWINGS.maxFiles) throw new Error(`Up to ${DRAWINGS.maxFiles} drawings per work order. Remove an old one first.`);
}

const startInput = z.object({ workOrderId: z.uuid(), fileName: z.string().trim().min(1).max(200), contentType: z.string().max(120), size: z.number().int().positive() });

/** Reserves the file and returns an upload link; the browser sends it straight to storage. */
export async function startDrawingUpload(tx: Tx, ctx: ActionContext, raw: z.input<typeof startInput>) {
  const v = startInput.parse(raw);
  const max = drawingLimit(v.contentType);
  if (!max) throw new Error('Upload PDF, DWG, DXF or an image. For anything else, add a link.');
  if (v.size > max) throw new Error(`Files up to ${fmtBytes(max)}. Add a link for bigger files.`);
  const wo = await openFor(tx, ctx, v.workOrderId);
  await assertRoom(tx, wo.id);
  const [d] = await tx
    .insert(prodDocs)
    .values({ companyId: ctx.companyId, workOrderId: wo.id, kind: 'file', name: v.fileName, contentType: v.contentType, sizeBytes: v.size, byId: ctx.membershipId })
    .returning({ id: prodDocs.id });
  const safe = v.fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
  const key = companyKey(ctx.companyId, 'production', 'drawings', wo.id, `${d.id}-${safe}`);
  const url = await presignUpload(key, v.contentType, v.size, { maxBytes: max, types: DRAWINGS.types });
  await tx.update(prodDocs).set({ s3Key: key }).where(eq(prodDocs.id, d.id));
  return { docId: d.id, url };
}

/** The upload finished: the drawing shows on the work order. Only the uploader can confirm. */
export async function confirmDrawingUpload(tx: Tx, ctx: ActionContext, raw: { docId: string }) {
  const docId = z.uuid().parse(raw.docId);
  const [d] = await tx
    .update(prodDocs)
    .set({ uploaded: true })
    .where(and(eq(prodDocs.id, docId), eq(prodDocs.companyId, ctx.companyId), eq(prodDocs.byId, ctx.membershipId), eq(prodDocs.kind, 'file')))
    .returning({ workOrderId: prodDocs.workOrderId, name: prodDocs.name, sizeBytes: prodDocs.sizeBytes });
  if (!d) throw new Error('Drawing not found');
  await logEvent(tx, ctx, d.workOrderId, `Drawing attached: ${d.name} (${fmtBytes(d.sizeBytes)})`, 'production.drawing.add');
  return { ok: true as const };
}

const linkInput = z.object({
  workOrderId: z.uuid(),
  name: z.string().trim().min(2, 'Name the link (e.g. GA drawings Rev B)').max(160),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((u) => /^https?:\/\/[^\s]+$/i.test(u), 'Paste a full web link starting with https://'),
});

export async function addDrawingLink(tx: Tx, ctx: ActionContext, raw: z.input<typeof linkInput>) {
  const v = linkInput.parse(raw);
  const wo = await openFor(tx, ctx, v.workOrderId);
  await assertRoom(tx, wo.id);
  await tx.insert(prodDocs).values({ companyId: ctx.companyId, workOrderId: wo.id, kind: 'link', name: v.name, url: v.url, uploaded: true, byId: ctx.membershipId });
  await logEvent(tx, ctx, wo.id, `Drawing link added: ${v.name}`, 'production.drawing.add');
  return { ok: true as const };
}

export async function removeDrawing(tx: Tx, ctx: ActionContext, raw: { docId: string }) {
  const docId = z.uuid().parse(raw.docId);
  const [d] = await tx.select({ workOrderId: prodDocs.workOrderId, name: prodDocs.name }).from(prodDocs).where(and(eq(prodDocs.id, docId), eq(prodDocs.companyId, ctx.companyId)));
  if (!d) throw new Error('Drawing not found');
  await openFor(tx, ctx, d.workOrderId);
  await tx.delete(prodDocs).where(eq(prodDocs.id, docId));
  await logEvent(tx, ctx, d.workOrderId, `Drawing removed: ${d.name}`, 'production.drawing.remove');
  return { ok: true as const };
}

/** Drawings on one work order (finished uploads and links). */
export async function listDrawings(tx: Tx, ctx: SessionContext, workOrderId: string) {
  const rows = await tx
    .select()
    .from(prodDocs)
    .where(and(eq(prodDocs.companyId, ctx.companyId), eq(prodDocs.workOrderId, workOrderId), eq(prodDocs.uploaded, true)))
    .orderBy(asc(prodDocs.createdAt));
  const people = await peopleById(tx, rows.map((r) => r.byId));
  return rows.map((r) => ({ id: r.id, kind: r.kind as 'file' | 'link', name: r.name, url: r.url, contentType: r.contentType, sizeBytes: r.sizeBytes, by: r.byId ? (people.get(r.byId) ?? '') : '', createdAt: r.createdAt.toISOString() }));
}

/** Drawing counts per work order, for lists (daily report). */
export async function drawingCounts(tx: Tx, ctx: SessionContext) {
  const rows = await tx
    .select({ wo: prodDocs.workOrderId, n: count() })
    .from(prodDocs)
    .where(and(eq(prodDocs.companyId, ctx.companyId), eq(prodDocs.uploaded, true)))
    .groupBy(prodDocs.workOrderId);
  return new Map(rows.map((r) => [r.wo, r.n]));
}

/** One uploaded drawing of this company, for the download link. */
export async function drawingFile(tx: Tx, companyId: string, id: string) {
  const [f] = await tx
    .select({ s3Key: prodDocs.s3Key })
    .from(prodDocs)
    .where(and(eq(prodDocs.id, id), eq(prodDocs.companyId, companyId), eq(prodDocs.kind, 'file'), eq(prodDocs.uploaded, true)));
  return f?.s3Key ? f : null;
}

/**
 * The customer's project documents from the Sales enquiry this work order came from (won sales
 * order). Read-only here; empty when there is no Sales data.
 */
export async function customerDocuments(tx: Tx, ctx: SessionContext, salesOrderId: string | null) {
  if (!salesOrderId) return [];
  try {
    return await tx.transaction(async (sp) => {
      const [so] = await sp.select({ enquiryId: salesOrders.enquiryId }).from(salesOrders).where(and(eq(salesOrders.id, salesOrderId), eq(salesOrders.companyId, ctx.companyId)));
      if (!so?.enquiryId) return [];
      const rows = await sp
        .select({ id: salesDocs.id, kind: salesDocs.kind, name: salesDocs.name, url: salesDocs.url, uploaded: salesDocs.uploaded, section: salesDocs.section })
        .from(salesDocs)
        .where(and(eq(salesDocs.companyId, ctx.companyId), eq(salesDocs.enquiryId, so.enquiryId)))
        .orderBy(asc(salesDocs.createdAt));
      return rows.filter((r) => r.section === 'project' && (r.kind === 'link' || r.uploaded)).map((r) => ({ id: r.id, kind: r.kind as 'file' | 'link', name: r.name, url: r.kind === 'link' ? r.url : `/api/sales-docs/${r.id}` }));
    });
  } catch {
    return [];
  }
}
