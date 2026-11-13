import { and, asc, eq } from 'drizzle-orm';
import { procReceiptFiles, type Tx } from '@orbit/db';

// Read-only access to receipt documents (MTC / test certificates). Used by requests.ts and
// receipt-files.ts, so neither has to import the other.

export type ReceiptFile = { id: string; fileName: string; contentType: string; sizeBytes: number; at: string };

const missingTable = (err: unknown) => {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '42P01' || /relation "proc_receipt_files" does not exist/.test(String(err));
};

/** Uploaded receipt documents of a request (empty before migration 0027). */
export async function receiptFilesFor(tx: Tx, companyId: string, requestId: string): Promise<ReceiptFile[]> {
  try {
    const rows = await tx.transaction((sp) =>
      sp
        .select({ id: procReceiptFiles.id, fileName: procReceiptFiles.fileName, contentType: procReceiptFiles.contentType, sizeBytes: procReceiptFiles.sizeBytes, at: procReceiptFiles.createdAt })
        .from(procReceiptFiles)
        .where(and(eq(procReceiptFiles.companyId, companyId), eq(procReceiptFiles.requestId, requestId), eq(procReceiptFiles.uploaded, true)))
        .orderBy(asc(procReceiptFiles.createdAt)),
    );
    return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
  } catch (err) {
    if (missingTable(err)) return [];
    throw err;
  }
}

/** One uploaded receipt document of this company, for the download link. */
export async function receiptFile(tx: Tx, companyId: string, fileId: string) {
  const [f] = await tx
    .select({ s3Key: procReceiptFiles.s3Key })
    .from(procReceiptFiles)
    .where(and(eq(procReceiptFiles.id, fileId), eq(procReceiptFiles.companyId, companyId), eq(procReceiptFiles.uploaded, true)));
  return f ?? null;
}
