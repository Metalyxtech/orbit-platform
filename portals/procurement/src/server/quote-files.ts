import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext } from '@orbit/core';
import { companyKey, presignUpload } from '@orbit/core/aws';
import { procQuoteFiles, procQuotes, procSuppliers, type Tx } from '@orbit/db';
import { assertQuoteStep, logOnRequest } from './requests';
export { filesForRequest, quoteFile, type QuoteFile } from './quote-file-store';
import type { QuoteFile } from './quote-file-store';

// Supplier quotation documents (PDF, photos) attached to quotes. The person who owns the quotes
// step uploads them; everyone who can open the request (managers, approvers, GM) can view them.

const MAX_PER_QUOTE = 10;

const startInput = z.object({
  quoteId: z.uuid(),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().max(120),
  size: z.number().int().positive(),
});

/** Reserves the file and returns a 5-minute upload link; the browser sends the file straight to S3. */
export async function startQuoteUpload(tx: Tx, ctx: ActionContext, raw: z.input<typeof startInput>) {
  const v = startInput.parse(raw);
  const [q] = await tx.select({ requestId: procQuotes.requestId }).from(procQuotes).where(and(eq(procQuotes.id, v.quoteId), eq(procQuotes.companyId, ctx.companyId)));
  if (!q) throw new Error('Quote not found');
  await assertQuoteStep(tx, ctx, q.requestId); // only while quotes are being collected, by the step owner
  const existing = await tx.select({ id: procQuoteFiles.id }).from(procQuoteFiles).where(eq(procQuoteFiles.quoteId, v.quoteId));
  if (existing.length >= MAX_PER_QUOTE) throw new Error(`Up to ${MAX_PER_QUOTE} files per quote`);
  const [f] = await tx
    .insert(procQuoteFiles)
    .values({ companyId: ctx.companyId, requestId: q.requestId, quoteId: v.quoteId, s3Key: 'pending', fileName: v.fileName, contentType: v.contentType, sizeBytes: v.size, byId: ctx.membershipId })
    .returning({ id: procQuoteFiles.id });
  const safe = v.fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
  const key = companyKey(ctx.companyId, 'procurement', 'quotes', q.requestId, `${f.id}-${safe}`);
  const url = await presignUpload(key, v.contentType, v.size); // checks file type and the 10 MB limit
  await tx.update(procQuoteFiles).set({ s3Key: key }).where(eq(procQuoteFiles.id, f.id));
  return { fileId: f.id, url };
}

/** The upload finished: the file becomes visible on the request. Only the uploader can confirm. */
export async function confirmQuoteUpload(tx: Tx, ctx: ActionContext, raw: { fileId: string }) {
  const fileId = z.uuid().parse(raw.fileId);
  const [f] = await tx
    .update(procQuoteFiles)
    .set({ uploaded: true })
    .where(and(eq(procQuoteFiles.id, fileId), eq(procQuoteFiles.companyId, ctx.companyId), eq(procQuoteFiles.byId, ctx.membershipId)))
    .returning({ requestId: procQuoteFiles.requestId, quoteId: procQuoteFiles.quoteId, fileName: procQuoteFiles.fileName });
  if (!f) throw new Error('File not found');
  const [s] = await tx.select({ name: procSuppliers.name }).from(procQuotes).innerJoin(procSuppliers, eq(procSuppliers.id, procQuotes.supplierId)).where(eq(procQuotes.id, f.quoteId));
  await logOnRequest(tx, ctx, f.requestId, `Quotation document attached for ${s?.name ?? 'supplier'}: ${f.fileName}`);
  return { ok: true as const };
}

/** Files per quote id, for lists of quotes. */
export const byQuote = (files: QuoteFile[], quoteIds: string[]) => Object.fromEntries(quoteIds.map((id) => [id, files.filter((f) => f.quoteId === id)]));
