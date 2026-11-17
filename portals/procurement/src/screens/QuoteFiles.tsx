'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@orbit/ui';
import { confirmQuoteUploadAction, startQuoteUploadAction } from '../actions';
import type { QuoteFile } from '../server';

// Supplier quotation documents on a quote: upload (quotes step owner) and links (everyone on the request).

export const QUOTE_FILE_TYPES = '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.docx';
const MAX = 10 * 1024 * 1024;

/** Link that opens a quote document (5-minute signed link, checked on the server). */
export const quoteFileUrl = (id: string) => `/api/proc-quote-files/${id}`;

/** Uploads files to one quote; returns the names that failed. */
export async function uploadQuoteFiles(quoteId: string, files: File[]) {
  const failed: string[] = [];
  for (const f of files) {
    if (!f.type || f.size > MAX) {
      failed.push(f.name);
      continue;
    }
    const start = await startQuoteUploadAction({ quoteId, fileName: f.name, contentType: f.type, size: f.size });
    if (!start.ok) {
      failed.push(f.name);
      continue;
    }
    const put = await fetch(start.data.url, { method: 'PUT', headers: { 'Content-Type': f.type }, body: f }).catch(() => null);
    if (put?.ok && (await confirmQuoteUploadAction({ fileId: start.data.fileId })).ok) continue;
    failed.push(f.name);
  }
  return failed;
}

/** The quote's documents as links (PDF / image icons by type). */
export function QuoteFileLinks({ files }: { files: QuoteFile[] }) {
  if (!files.length) return null;
  return (
    <span className="o-row" style={{ gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
      {files.map((f) => (
        <a key={f.id} href={quoteFileUrl(f.id)} target="_blank" rel="noreferrer" title={f.fileName}>
          {f.contentType === 'application/pdf' ? 'PDF' : f.contentType.startsWith('image/') ? 'Image' : 'File'}: {f.fileName.length > 28 ? `${f.fileName.slice(0, 25)}…` : f.fileName}
        </a>
      ))}
    </span>
  );
}

/** "Attach quotation" for a quote already entered. */
export function AttachQuoteFiles({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <label className="o-btn small" style={{ cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
      {busy ? 'Uploading…' : 'Attach quotation'}
      <input
        type="file"
        multiple
        accept={QUOTE_FILE_TYPES}
        disabled={busy}
        style={{ display: 'none' }}
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (!files.length) return;
          setBusy(true);
          const failed = await uploadQuoteFiles(quoteId, files);
          setBusy(false);
          toast(failed.length ? `Not uploaded: ${failed.join(', ')} (PDF, image, Word or Excel up to 10 MB).` : 'Quotation attached.', failed.length ? 'bad' : undefined);
          router.refresh();
        }}
      />
    </label>
  );
}
