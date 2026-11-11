import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext, SessionContext } from '@orbit/core';
import { companyKey, presignUpload } from '@orbit/core/aws';
import { addInspectionDocuments, qualityOn, requestInspection, type QualityDecision } from '@orbit/core/quality';
import { prodReceiptFiles, prodReceipts, type Tx } from '@orbit/db';
import { fmtQty, RECEIPT_DOCS } from '../config';
import { stockIn } from './stock';
import { myRole, peopleById, requireRole } from './shared';

// Material received into the production store (the store supervisor's "Material received").
// With the Quality portal the receipt waits for QC (with the MTC the store uploads) before it is
// booked into stock; without it, it goes into stock straight away. Deliveries of goods Purchase
// bought for a material request are recorded from the request (mr.ts) and listed here too.

const lineInput = z.object({ item: z.string().trim().min(1, 'Name every item').max(200), qty: z.number().positive('Enter a quantity'), unit: z.string().trim().min(1).max(20) });
const receiveInput = z.object({
  reference: z.string().trim().min(1, 'Enter the delivery note / challan number').max(80),
  supplier: z.string().trim().max(200).optional(),
  lines: z.array(lineInput).min(1, 'Add at least one item').max(100),
  note: z.string().trim().max(500).optional(),
});

/** Direct receipt at the shop floor (not through a material request). */
export async function receiveDirect(tx: Tx, ctx: ActionContext, raw: z.input<typeof receiveInput>) {
  const v = receiveInput.parse(raw);
  requireRole(await myRole(tx, ctx), 'store', 'manager');
  const [{ n }] = await tx.select({ n: count() }).from(prodReceipts).where(eq(prodReceipts.companyId, ctx.companyId));
  const number = `GR-${String(n + 1).padStart(4, '0')}`;
  const qc = await qualityOn(tx, ctx.companyId);
  const [rc] = await tx
    .insert(prodReceipts)
    .values({ companyId: ctx.companyId, number, reference: v.reference, supplier: v.supplier || null, lines: v.lines, status: qc ? 'qc' : 'accepted', note: v.note || null, byId: ctx.membershipId })
    .returning();
  if (qc) {
    await requestInspection(tx, ctx, {
      source: 'store',
      sourceId: rc.id,
      sourceRef: number,
      title: `Material received at the production store: ${v.lines.map((l) => l.item).join(', ')}`.slice(0, 200),
      party: v.supplier || null,
      details: [
        { label: 'Store receipt', value: number },
        { label: 'Delivery note', value: v.reference },
        ...(v.supplier ? [{ label: 'Supplier', value: v.supplier }] : []),
        { label: 'Received at', value: 'Production store' },
        ...(v.note ? [{ label: 'Store note', value: v.note }] : []),
      ],
      items: v.lines,
      checklist: ['Quantity matches the delivery note', 'Material grade / specification as ordered', 'No visible damage, rust or defects', 'MTC / test certificates match the material (heat no.)'],
      documents: [],
    });
  } else {
    await stockIn(tx, ctx, v.lines, number, `Received: ${v.reference}`);
  }
  return { id: rc.id, number, qc };
}

/** QC's final result on a store receipt (registered with @orbit/core/quality as source "store"). */
export async function onStoreQualityResult(tx: Tx, ctx: ActionContext, d: QualityDecision) {
  const [rc] = await tx.select().from(prodReceipts).where(and(eq(prodReceipts.id, d.sourceId), eq(prodReceipts.companyId, ctx.companyId))).for('update');
  if (!rc || rc.status !== 'qc') return;
  if (d.result === 'pass') {
    await stockIn(tx, ctx, rc.lines, rc.number, `QC passed (${d.number})`);
    await tx.update(prodReceipts).set({ status: 'accepted' }).where(eq(prodReceipts.id, rc.id));
  } else {
    await tx.update(prodReceipts).set({ status: 'rejected', note: [rc.note, `QC failed (${d.number}): ${d.ncr ?? ''}`].filter(Boolean).join(' · ').slice(0, 1000) }).where(eq(prodReceipts.id, rc.id));
  }
}

export async function listReceipts(tx: Tx, ctx: SessionContext) {
  const rows = await tx.select().from(prodReceipts).where(eq(prodReceipts.companyId, ctx.companyId)).orderBy(desc(prodReceipts.createdAt)).limit(200);
  const files = rows.length
    ? await tx
        .select({ id: prodReceiptFiles.id, receiptId: prodReceiptFiles.receiptId, fileName: prodReceiptFiles.fileName })
        .from(prodReceiptFiles)
        .where(and(inArray(prodReceiptFiles.receiptId, rows.map((r) => r.id)), eq(prodReceiptFiles.uploaded, true)))
    : [];
  const people = await peopleById(tx, rows.map((r) => r.byId));
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    reference: r.reference,
    supplier: r.supplier,
    status: r.status,
    fromPurchase: !!r.purchaseId,
    items: r.lines.map((l) => `${l.item} ${fmtQty(l.qty)} ${l.unit}`).join(', '),
    note: r.note,
    by: people.get(r.byId ?? '') ?? '',
    at: r.createdAt.toISOString(),
    files: files.filter((f) => f.receiptId === r.id).map((f) => ({ id: f.id, name: f.fileName })),
  }));
}
export type ReceiptRow = Awaited<ReturnType<typeof listReceipts>>[number];

// ---------- MTC / documents ----------

const startInput = z.object({ receiptId: z.uuid(), fileName: z.string().trim().min(1).max(200), contentType: z.string().max(120), size: z.number().int().positive() });

export async function startReceiptUpload(tx: Tx, ctx: ActionContext, raw: z.input<typeof startInput>) {
  const v = startInput.parse(raw);
  requireRole(await myRole(tx, ctx), 'store', 'manager');
  const [rc] = await tx.select().from(prodReceipts).where(and(eq(prodReceipts.id, v.receiptId), eq(prodReceipts.companyId, ctx.companyId)));
  if (!rc) throw new Error('Receipt not found');
  const [{ n }] = await tx.select({ n: count() }).from(prodReceiptFiles).where(eq(prodReceiptFiles.receiptId, rc.id));
  if (n >= RECEIPT_DOCS.maxFiles) throw new Error(`Up to ${RECEIPT_DOCS.maxFiles} documents per receipt`);
  const [f] = await tx
    .insert(prodReceiptFiles)
    .values({ companyId: ctx.companyId, receiptId: rc.id, s3Key: 'pending', fileName: v.fileName, contentType: v.contentType, sizeBytes: v.size, byId: ctx.membershipId })
    .returning({ id: prodReceiptFiles.id });
  const safe = v.fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
  const key = companyKey(ctx.companyId, 'production', 'receipts', rc.id, `${f.id}-${safe}`);
  const url = await presignUpload(key, v.contentType, v.size, { maxBytes: RECEIPT_DOCS.maxBytes, types: RECEIPT_DOCS.types });
  await tx.update(prodReceiptFiles).set({ s3Key: key }).where(eq(prodReceiptFiles.id, f.id));
  return { fileId: f.id, url };
}

/** Upload finished: QC gets it on the open inspection (the store receipt, or the purchase it came on). */
export async function confirmReceiptUpload(tx: Tx, ctx: ActionContext, raw: { fileId: string }) {
  const fileId = z.uuid().parse(raw.fileId);
  const [f] = await tx
    .update(prodReceiptFiles)
    .set({ uploaded: true })
    .where(and(eq(prodReceiptFiles.id, fileId), eq(prodReceiptFiles.companyId, ctx.companyId), eq(prodReceiptFiles.byId, ctx.membershipId)))
    .returning({ receiptId: prodReceiptFiles.receiptId, fileName: prodReceiptFiles.fileName });
  if (!f) throw new Error('File not found');
  const [rc] = await tx.select().from(prodReceipts).where(eq(prodReceipts.id, f.receiptId));
  const doc = [{ name: `MTC / receipt ${rc.number}: ${f.fileName}`, url: `/api/production-receipt-files/${fileId}` }];
  if (rc.purchaseId) await addInspectionDocuments(tx, ctx.companyId, 'purchase', rc.purchaseId, doc);
  else await addInspectionDocuments(tx, ctx.companyId, 'store', rc.id, doc);
  return { ok: true as const };
}

/** One uploaded document of this company, for the download link. */
export async function receiptFile(tx: Tx, companyId: string, fileId: string) {
  const [f] = await tx
    .select({ s3Key: prodReceiptFiles.s3Key })
    .from(prodReceiptFiles)
    .where(and(eq(prodReceiptFiles.id, fileId), eq(prodReceiptFiles.companyId, companyId), eq(prodReceiptFiles.uploaded, true)));
  return f ?? null;
}
