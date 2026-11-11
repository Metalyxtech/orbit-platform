'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@orbit/ui';
import { confirmReceiptUploadAction, startReceiptUploadAction } from '../actions';
import type { RequestDetail } from '../server';

// MTC / test certificates and delivery documents the store uploads at goods receipt. QC sees them.

const TYPES = '.pdf,.png,.jpg,.jpeg,.webp';
const MAX = 25 * 1024 * 1024;
export const receiptFileUrl = (id: string) => `/api/proc-receipt-files/${id}`;

function put(url: string, file: File, onProgress: (pct: number) => void) {
  return new Promise<boolean>((resolve) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', file.type);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => resolve(x.status >= 200 && x.status < 300);
    x.onerror = () => resolve(false);
    x.send(file);
  });
}

export function ReceiptDocs({ d }: { d: RequestDetail }) {
  const router = useRouter();
  const toast = useToast();
  const [progress, setProgress] = useState<string | null>(null);
  if (!d.receiptFiles.length && !d.canUploadReceiptDocs) return null;
  async function upload(files: File[]) {
    const failed: string[] = [];
    for (const f of files) {
      if (!f.type || f.size > MAX) {
        failed.push(f.name);
        continue;
      }
      setProgress(`${f.name}: starting`);
      const start = await startReceiptUploadAction({ requestId: d.request.id, fileName: f.name, contentType: f.type, size: f.size });
      if (!start.ok) {
        failed.push(`${f.name} (${start.error})`);
        continue;
      }
      const ok = await put(start.data.url, f, (p) => setProgress(`${f.name}: ${p}%`));
      if (!ok || !(await confirmReceiptUploadAction({ fileId: start.data.fileId })).ok) failed.push(f.name);
    }
    setProgress(null);
    toast(failed.length ? `Not uploaded: ${failed.join(', ')}. PDF or image up to 25 MB.` : 'Receipt documents uploaded. QC can open them.', failed.length ? 'bad' : undefined);
    router.refresh();
  }
  return (
    <div className="o-panel">
      <div className="o-panel-head">
        <h2>Receipt documents (MTC)</h2>
        {d.canUploadReceiptDocs && (
          <label className="o-btn small" style={{ cursor: progress ? 'wait' : 'pointer' }}>
            {progress ?? 'Upload MTC / documents'}
            <input
              type="file"
              multiple
              accept={TYPES}
              disabled={!!progress}
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                if (files.length) void upload(files);
              }}
            />
          </label>
        )}
      </div>
      {d.receiptFiles.length ? (
        <ul className="o-stack" style={{ gap: 4, margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {d.receiptFiles.map((f) => (
            <li key={f.id}>
              <a href={receiptFileUrl(f.id)} target="_blank" rel="noreferrer">
                {f.fileName}
              </a>{' '}
              <span className="faint" style={{ fontSize: 11 }}>
                {(f.sizeBytes / 1024 / 1024).toFixed(1)} MB
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Mill test certificates, test reports and the delivery documents. QC sees them with the incoming inspection.
        </p>
      )}
    </div>
  );
}
