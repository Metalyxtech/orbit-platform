import { and, eq } from 'drizzle-orm';
import { procQuoteFiles, type Tx } from '@orbit/db';

// Read-only access to quote documents. Used by requests.ts (request page) and quote-files.ts
// (uploads), so neither has to import the other.

export type QuoteFile = { id: string; quoteId: string; fileName: string; contentType: string; sizeBytes: number };

const missingTable = (err: unknown) => {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '42P01' || /relation "proc_quote_files" does not exist/.test(String(err));
};

/** Uploaded files of a request's quotes (empty before migration 0016). */
export async function filesForRequest(tx: Tx, companyId: string, requestId: string): Promise<QuoteFile[]> {
  try {
    return await tx.transaction((sp) =>
      sp
        .select({ id: procQuoteFiles.id, quoteId: procQuoteFiles.quoteId, fileName: procQuoteFiles.fileName, contentType: procQuoteFiles.contentType, sizeBytes: procQuoteFiles.sizeBytes })
        .from(procQuoteFiles)
        .where(and(eq(procQuoteFiles.companyId, companyId), eq(procQuoteFiles.requestId, requestId), eq(procQuoteFiles.uploaded, true))),
    );
  } catch (err) {
    if (missingTable(err)) return [];
    throw err;
  }
}

/** One uploaded file of this company, for the download link. */
export async function quoteFile(tx: Tx, companyId: string, fileId: string) {
  const [f] = await tx
    .select({ s3Key: procQuoteFiles.s3Key })
    .from(procQuoteFiles)
    .where(and(eq(procQuoteFiles.id, fileId), eq(procQuoteFiles.companyId, companyId), eq(procQuoteFiles.uploaded, true)));
  return f ?? null;
}

