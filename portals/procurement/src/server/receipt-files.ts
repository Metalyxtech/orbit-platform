import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext } from '@orbit/core';
import { companyKey, presignUpload } from '@orbit/core/aws';
import { addInspectionDocuments } from '@orbit/core/quality';
import { procReceiptFiles, type Tx } from '@orbit/db';
import { lockRequest, logOnRequest } from './requests';
import { myRoles } from './shared';
export { receiptFile, receiptFilesFor, type ReceiptFile } from './receipt-file-store';

// MTC / mill test certificates and delivery documents the store uploads at goods receipt.
// QC sees them on the incoming inspection (added to it when the inspection is already open).

const MAX_FILES = 20;
const TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 25 * 1024 * 1024;

const startInput = z.object({ requestId: z.uuid(), fileName: z.string().trim().min(1).max(200), contentType: z.string().max(120), size: z.number().int().positive() });

export async function startReceiptUpload(tx: Tx, ctx: ActionContext, raw: z.input<typeof startInput>) {
  const v = startInput.parse(raw);
  const { roles } = await myRoles(tx, ctx);
  if (!roles.some((r) => r === 'store' || r === 'buyer' || r === 'manager')) throw new Error('Only the store, purchase engineer or manager can upload receipt documents');
  const r = await lockRequest(tx, ctx, v.requestId);
  if (!['receiving', 'inspection'].includes(r.stage)) throw new Error('Receipt documents are added while goods are being received or inspected');
  const [{ n }] = await tx.select({ n: count() }).from(procReceiptFiles).where(eq(procReceiptFiles.requestId, r.id));
  if (n >= MAX_FILES) throw new Error(`Up to ${MAX_FILES} receipt documents per request`);
  const [f] = await tx
    .insert(procReceiptFiles)
    .values({ companyId: ctx.companyId, requestId: r.id, s3Key: 'pending', fileName: v.fileName, contentType: v.contentType, sizeBytes: v.size, byId: ctx.membershipId })
    .returning({ id: procReceiptFiles.id });
  const safe = v.fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
  const key = companyKey(ctx.companyId, 'procurement', 'receipts', r.id, `${f.id}-${safe}`);
  const url = await presignUpload(key, v.contentType, v.size, { maxBytes: MAX_BYTES, types: TYPES });
  await tx.update(procReceiptFiles).set({ s3Key: key }).where(eq(procReceiptFiles.id, f.id));
  return { fileId: f.id, url };
}

/** The upload finished: QC gets the document on the open inspection. Only the uploader can confirm. */
export async function confirmReceiptUpload(tx: Tx, ctx: ActionContext, raw: { fileId: string }) {
  const fileId = z.uuid().parse(raw.fileId);
  const [f] = await tx
    .update(procReceiptFiles)
    .set({ uploaded: true })
    .where(and(eq(procReceiptFiles.id, fileId), eq(procReceiptFiles.companyId, ctx.companyId), eq(procReceiptFiles.byId, ctx.membershipId)))
    .returning({ requestId: procReceiptFiles.requestId, fileName: procReceiptFiles.fileName });
  if (!f) throw new Error('File not found');
  await logOnRequest(tx, ctx, f.requestId, `Receipt document attached: ${f.fileName}`);
  await addInspectionDocuments(tx, ctx.companyId, 'purchase', f.requestId, [{ name: `MTC / receipt: ${f.fileName}`, url: `/api/proc-receipt-files/${fileId}` }]);
  return { ok: true as const };
}
