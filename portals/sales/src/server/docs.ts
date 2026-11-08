import { and, count, eq, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext } from '@orbit/core';
import { companyKey, presignUpload } from '@orbit/core/aws';
import { salesDocs, type Tx } from '@orbit/db';
import { DOCS, fmtBytes } from '../config';
import { hasRole, lockEnquiry, logEvent, myRole, requireRole } from './shared';
export { docFile, listDocs, projectDocuments, type ProjectDocs, type SalesDoc } from './doc-store';

// Project documents for the estimator: PDFs up to 100 MB uploaded to Orbit, or links to bigger
// files kept elsewhere (drawings or models over 2 GB on Drive, OneDrive, WeTransfer...).
// The sales executive (owner) or the sales manager adds and removes them until pricing is done.

async function openProjectFor(tx: Tx, ctx: ActionContext, enquiryId: string) {
  const me = await myRole(tx, ctx);
  requireRole(me, 'exec', 'manager');
  const r = await lockEnquiry(tx, ctx, enquiryId);
  if (!(hasRole(me, 'manager') || r.ownerId === ctx.membershipId)) throw new Error('Only the enquiry owner or the sales manager can change documents');
  if (r.pricingDoneAt || !['enquiry', 'costing'].includes(r.stage)) throw new Error('Pricing is done, so the project documents are locked. Ask the sales manager to reopen it.');
  return r;
}

async function assertRoom(tx: Tx, enquiryId: string) {
  // Uploads that never finished (browser closed) stop counting after two hours.
  await tx.delete(salesDocs).where(and(eq(salesDocs.enquiryId, enquiryId), eq(salesDocs.uploaded, false), lt(salesDocs.createdAt, sql`now() - interval '2 hours'`)));
  const [{ n }] = await tx.select({ n: count() }).from(salesDocs).where(eq(salesDocs.enquiryId, enquiryId));
  if (n >= DOCS.maxFiles) throw new Error(`Up to ${DOCS.maxFiles} documents per project (files and links together). Remove one first.`);
}

const startInput = z.object({
  enquiryId: z.uuid(),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().max(120),
  size: z.number().int().positive(),
});

/** Reserves the file and returns an upload link; the browser sends the PDF straight to S3. */
export async function startDocUpload(tx: Tx, ctx: ActionContext, raw: z.input<typeof startInput>) {
  const v = startInput.parse(raw);
  if (!DOCS.types.includes(v.contentType)) throw new Error('Upload PDF files. For drawings, models or anything bigger, add a link.');
  if (v.size > DOCS.maxPdfBytes) throw new Error(`PDFs up to ${fmtBytes(DOCS.maxPdfBytes)}. Add a link for bigger files.`);
  const r = await openProjectFor(tx, ctx, v.enquiryId);
  await assertRoom(tx, r.id);
  const [f] = await tx
    .insert(salesDocs)
    .values({ companyId: ctx.companyId, enquiryId: r.id, kind: 'file', name: v.fileName, s3Key: null, contentType: v.contentType, sizeBytes: v.size, byId: ctx.membershipId })
    .returning({ id: salesDocs.id });
  const safe = v.fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
  const key = companyKey(ctx.companyId, 'sales', 'projects', r.id, `${f.id}-${safe}`);
  const url = await presignUpload(key, v.contentType, v.size, { maxBytes: DOCS.maxPdfBytes, types: DOCS.types });
  await tx.update(salesDocs).set({ s3Key: key }).where(eq(salesDocs.id, f.id));
  return { docId: f.id, url };
}

/** The upload finished: the document shows on the project. Only the uploader can confirm. */
export async function confirmDocUpload(tx: Tx, ctx: ActionContext, raw: { docId: string }) {
  const docId = z.uuid().parse(raw.docId);
  const [f] = await tx
    .update(salesDocs)
    .set({ uploaded: true })
    .where(and(eq(salesDocs.id, docId), eq(salesDocs.companyId, ctx.companyId), eq(salesDocs.byId, ctx.membershipId), eq(salesDocs.kind, 'file')))
    .returning({ enquiryId: salesDocs.enquiryId, name: salesDocs.name, sizeBytes: salesDocs.sizeBytes });
  if (!f) throw new Error('Document not found');
  await logEvent(tx, ctx, f.enquiryId, `Document uploaded: ${f.name} (${fmtBytes(f.sizeBytes)})`);
  return { ok: true as const };
}

const linkInput = z.object({
  enquiryId: z.uuid(),
  name: z.string().trim().min(2, 'Name the link (for example, GA drawings rev B)').max(160),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((u) => /^https:\/\/[^\s]+$/i.test(u) || /^http:\/\/[^\s]+$/i.test(u), 'Paste a full web link starting with https://'),
});

/** A link to a large file kept elsewhere (no size limit). */
export async function addLink(tx: Tx, ctx: ActionContext, raw: z.input<typeof linkInput>) {
  const v = linkInput.parse(raw);
  const r = await openProjectFor(tx, ctx, v.enquiryId);
  await assertRoom(tx, r.id);
  await tx.insert(salesDocs).values({ companyId: ctx.companyId, enquiryId: r.id, kind: 'link', name: v.name, url: v.url, uploaded: true, byId: ctx.membershipId });
  await logEvent(tx, ctx, r.id, `Link added: ${v.name}`);
  return { ok: true as const };
}

/** Removes a document while the project is still open for changes. */
export async function removeDoc(tx: Tx, ctx: ActionContext, raw: { docId: string }) {
  const docId = z.uuid().parse(raw.docId);
  const [d] = await tx.select({ enquiryId: salesDocs.enquiryId, name: salesDocs.name }).from(salesDocs).where(and(eq(salesDocs.id, docId), eq(salesDocs.companyId, ctx.companyId)));
  if (!d) throw new Error('Document not found');
  await openProjectFor(tx, ctx, d.enquiryId);
  await tx.delete(salesDocs).where(eq(salesDocs.id, docId));
  await logEvent(tx, ctx, d.enquiryId, `Document removed: ${d.name}`);
  return { ok: true as const };
}
