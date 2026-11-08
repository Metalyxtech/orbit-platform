import { and, count, eq, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext } from '@orbit/core';
import { companyKey, presignUpload } from '@orbit/core/aws';
import { salesDocs, type Tx } from '@orbit/db';
import { DOCS, docLimit, fmtBytes, type DocSection } from '../config';
import { hasRole, lockEnquiry, logEvent, myRole, requireRole } from './shared';
export { docFile, listDocs, projectDocuments, type ProjectDocs, type SalesDoc } from './doc-store';

// Documents on an enquiry, in two sections:
// - project: what the customer sent (drawings, specs). Sales (owner or manager) adds and removes
//   them until pricing is done. Everyone in the company can open them.
// - costing: the estimator's attachments (costing sheets, supplier quotes, site photos), while
//   costing. Only the estimator, sales manager and GM see them.
// Each section holds up to 10 files and links: PDFs up to 100 MB, images up to 20 MB, or links.

const SECTION = z.enum(['project', 'costing']).default('project');

async function openFor(tx: Tx, ctx: ActionContext, enquiryId: string, section: DocSection) {
  const me = await myRole(tx, ctx);
  const r = await lockEnquiry(tx, ctx, enquiryId);
  if (section === 'costing') {
    requireRole(me, 'estimator');
    if (r.stage !== 'costing' || r.pricingDoneAt) throw new Error('Costing attachments can change only while the enquiry is with the estimator');
    return r;
  }
  requireRole(me, 'exec', 'manager');
  if (!(hasRole(me, 'manager') || r.ownerId === ctx.membershipId)) throw new Error('Only the enquiry owner or the sales manager can change documents');
  if (r.pricingDoneAt || !['enquiry', 'costing'].includes(r.stage)) throw new Error('Pricing is done, so the project documents are locked. Ask the sales manager to reopen it.');
  return r;
}

async function assertRoom(tx: Tx, enquiryId: string, section: DocSection) {
  // Uploads that never finished (browser closed) stop counting after two hours.
  await tx.delete(salesDocs).where(and(eq(salesDocs.enquiryId, enquiryId), eq(salesDocs.uploaded, false), lt(salesDocs.createdAt, sql`now() - interval '2 hours'`)));
  const [{ n }] = await tx.select({ n: count() }).from(salesDocs).where(and(eq(salesDocs.enquiryId, enquiryId), eq(salesDocs.section, section)));
  if (n >= DOCS.maxFiles) throw new Error(`Up to ${DOCS.maxFiles} documents here (files and links together). Remove one first.`);
}

const startInput = z.object({
  enquiryId: z.uuid(),
  section: SECTION,
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().max(120),
  size: z.number().int().positive(),
});

/** Reserves the file and returns an upload link; the browser sends the file straight to S3. */
export async function startDocUpload(tx: Tx, ctx: ActionContext, raw: z.input<typeof startInput>) {
  const v = startInput.parse(raw);
  const max = docLimit(v.contentType);
  if (!max) throw new Error('Upload a PDF or an image (PNG, JPG, WebP). For drawings, models or anything bigger, add a link.');
  if (v.size > max) throw new Error(`${v.contentType === 'application/pdf' ? 'PDFs' : 'Images'} up to ${fmtBytes(max)}. Add a link for bigger files.`);
  const r = await openFor(tx, ctx, v.enquiryId, v.section);
  await assertRoom(tx, r.id, v.section);
  const [f] = await tx
    .insert(salesDocs)
    .values({ companyId: ctx.companyId, enquiryId: r.id, section: v.section, kind: 'file', name: v.fileName, s3Key: null, contentType: v.contentType, sizeBytes: v.size, byId: ctx.membershipId })
    .returning({ id: salesDocs.id });
  const safe = v.fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
  const key = companyKey(ctx.companyId, 'sales', v.section === 'costing' ? 'costing' : 'projects', r.id, `${f.id}-${safe}`);
  const url = await presignUpload(key, v.contentType, v.size, { maxBytes: max, types: DOCS.types });
  await tx.update(salesDocs).set({ s3Key: key }).where(eq(salesDocs.id, f.id));
  return { docId: f.id, url };
}

/** The upload finished: the document shows on the enquiry. Only the uploader can confirm. */
export async function confirmDocUpload(tx: Tx, ctx: ActionContext, raw: { docId: string }) {
  const docId = z.uuid().parse(raw.docId);
  const [f] = await tx
    .update(salesDocs)
    .set({ uploaded: true })
    .where(and(eq(salesDocs.id, docId), eq(salesDocs.companyId, ctx.companyId), eq(salesDocs.byId, ctx.membershipId), eq(salesDocs.kind, 'file')))
    .returning({ enquiryId: salesDocs.enquiryId, name: salesDocs.name, sizeBytes: salesDocs.sizeBytes, section: salesDocs.section });
  if (!f) throw new Error('Document not found');
  await logEvent(tx, ctx, f.enquiryId, `${f.section === 'costing' ? 'Costing attachment' : 'Document'} uploaded: ${f.name} (${fmtBytes(f.sizeBytes)})`);
  return { ok: true as const };
}

const linkInput = z.object({
  enquiryId: z.uuid(),
  section: SECTION,
  name: z.string().trim().min(2, 'Name the link (for example, GA drawings rev B)').max(160),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((u) => /^https?:\/\/[^\s]+$/i.test(u), 'Paste a full web link starting with https://'),
});

/** A link to a large file kept elsewhere (no size limit). */
export async function addLink(tx: Tx, ctx: ActionContext, raw: z.input<typeof linkInput>) {
  const v = linkInput.parse(raw);
  const r = await openFor(tx, ctx, v.enquiryId, v.section);
  await assertRoom(tx, r.id, v.section);
  await tx.insert(salesDocs).values({ companyId: ctx.companyId, enquiryId: r.id, section: v.section, kind: 'link', name: v.name, url: v.url, uploaded: true, byId: ctx.membershipId });
  await logEvent(tx, ctx, r.id, `${v.section === 'costing' ? 'Costing link' : 'Link'} added: ${v.name}`);
  return { ok: true as const };
}

/** Removes a document while its section is still open for changes. */
export async function removeDoc(tx: Tx, ctx: ActionContext, raw: { docId: string }) {
  const docId = z.uuid().parse(raw.docId);
  const [d] = await tx.select({ enquiryId: salesDocs.enquiryId, name: salesDocs.name, section: salesDocs.section }).from(salesDocs).where(and(eq(salesDocs.id, docId), eq(salesDocs.companyId, ctx.companyId)));
  if (!d) throw new Error('Document not found');
  await openFor(tx, ctx, d.enquiryId, d.section as DocSection);
  await tx.delete(salesDocs).where(eq(salesDocs.id, docId));
  await logEvent(tx, ctx, d.enquiryId, `${d.section === 'costing' ? 'Costing attachment' : 'Document'} removed: ${d.name}`);
  return { ok: true as const };
}
