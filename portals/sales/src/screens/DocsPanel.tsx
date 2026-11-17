'use client';
import { useState } from 'react';
import { Button } from '@orbit/ui';
import { DOCS, docLimit, fmtBytes, fmtDate, type DocSection } from '../config';
import { addLinkAction, confirmDocUploadAction, removeDocAction, startDocUploadAction } from '../actions';
import { useRun } from './useRun';

// Project documents for costing: PDFs up to 100 MB (uploaded straight to storage, with progress)
// or links for bigger files. Editable by sales until pricing is done; everyone else can open them.

export interface DocView {
  id: string;
  kind: 'file' | 'link';
  contentType?: string | null;
  name: string;
  url: string | null;
  sizeBytes: number | null;
  by: string;
  createdAt: Date | string;
}

/** Link that opens an uploaded document (short signed link, checked on the server). */
export const docUrl = (d: Pick<DocView, 'id' | 'kind' | 'url'>) => (d.kind === 'link' ? (d.url ?? '#') : `/api/sales-docs/${d.id}`);

function putWithProgress(url: string, file: File, onProgress: (pct: number) => void) {
  return new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

export function DocList({ docs }: { docs: DocView[] }) {
  if (!docs.length) return <p className="faint" style={{ margin: 0, fontSize: 12 }}>No documents yet.</p>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {docs.map((d) => (
        <li key={d.id} className="o-row" style={{ gap: 8, fontSize: 13 }}>
          <span className="faint" style={{ fontSize: 11, minWidth: 34 }}>{d.kind === 'link' ? 'LINK' : d.contentType?.startsWith('image/') ? 'IMAGE' : 'PDF'}</span>
          <a href={docUrl(d)} target="_blank" rel="noopener noreferrer" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.name}>
            {d.name}
          </a>
          <span className="faint" style={{ fontSize: 11, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {d.kind === 'file' ? fmtBytes(d.sizeBytes) : 'external'}{d.by ? ` · ${d.by}` : ''} · {fmtDate(typeof d.createdAt === 'string' ? d.createdAt : d.createdAt.toISOString())}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DocsPanel({
  enquiryId,
  docs,
  canEdit,
  lockedReason,
  section = 'project',
  title = 'Project documents',
  intro,
}: {
  enquiryId: string;
  docs: DocView[];
  canEdit: boolean;
  lockedReason?: string;
  section?: DocSection;
  title?: string;
  intro?: string;
}) {
  const { busy, run, toast, router } = useRun();
  const [progress, setProgress] = useState<string | null>(null);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const room = DOCS.maxFiles - docs.length;

  async function upload(files: File[]) {
    if (files.length > room) {
      toast(`Only ${room} more document${room === 1 ? '' : 's'} fit here (${DOCS.maxFiles} in all).`, 'bad');
      return;
    }
    const failed: string[] = [];
    for (const f of files) {
      const max = docLimit(f.type);
      if (!max) {
        failed.push(`${f.name} (use PDF, PNG, JPG or WebP)`);
        continue;
      }
      if (f.size > max) {
        failed.push(`${f.name} (over ${fmtBytes(max)}: add a link instead)`);
        continue;
      }
      setProgress(`${f.name}: starting`);
      const start = await startDocUploadAction({ enquiryId, section, fileName: f.name, contentType: f.type, size: f.size });
      if (!start.ok) {
        failed.push(`${f.name} (${start.error})`);
        continue;
      }
      const ok = await putWithProgress(start.data.url, f, (p) => setProgress(`${f.name}: ${p}%`));
      if (!ok || !(await confirmDocUploadAction({ docId: start.data.docId })).ok) failed.push(f.name);
    }
    setProgress(null);
    toast(failed.length ? `Not uploaded: ${failed.join(', ')}` : 'Documents uploaded.', failed.length ? 'bad' : undefined);
    router.refresh();
  }

  return (
    <div className="o-panel">
      <div className="o-panel-head">
        <h2>{title}</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          {docs.length} of {DOCS.maxFiles}
        </span>
      </div>
      {intro && <p className="muted" style={{ fontSize: 12, margin: '-6px 0 10px' }}>{intro}</p>}
      <DocList docs={docs} />
      {canEdit ? (
        <div className="o-stack" style={{ gap: 10, marginTop: 14, borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
          <div className="o-row" style={{ flexWrap: 'wrap' }}>
            <label className="o-btn small" style={{ cursor: progress || room <= 0 ? 'not-allowed' : 'pointer', opacity: progress || room <= 0 ? 0.6 : 1 }}>
              {progress ? `Uploading ${progress}` : 'Upload PDF or images'}
              <input
                type="file"
                multiple
                accept={DOCS.accept}
                disabled={!!progress || room <= 0}
                style={{ display: 'none' }}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (files.length) void upload(files);
                }}
              />
            </label>
            <span className="faint" style={{ fontSize: 11 }}>
              PDF up to {fmtBytes(DOCS.maxPdfBytes)}, images up to {fmtBytes(DOCS.maxImageBytes)}. Bigger files (drawings, models, over 2 GB): add a link.
            </span>
          </div>
          <div className="o-form-row" style={{ alignItems: 'flex-end' }}>
            <label className="o-field">
              Link name
              <input className="o-input" value={linkName} maxLength={160} placeholder="GA drawings rev B" onChange={(e) => setLinkName(e.target.value)} />
            </label>
            <label className="o-field" style={{ flex: '2 1 260px' }}>
              Web link (Drive, OneDrive, Dropbox, WeTransfer...)
              <input className="o-input" value={linkUrl} maxLength={2000} placeholder="https://" onChange={(e) => setLinkUrl(e.target.value)} />
            </label>
            <Button
              size="small"
              disabled={busy || room <= 0 || !linkName.trim() || !linkUrl.trim()}
              onClick={async () => {
                if (await run(() => addLinkAction({ enquiryId, section, name: linkName, url: linkUrl }), 'Link added.')) {
                  setLinkName('');
                  setLinkUrl('');
                }
              }}
            >
              Add link
            </Button>
          </div>
          {docs.length > 0 && (
            <details>
              <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
                Remove a document
              </summary>
              <div className="o-stack" style={{ gap: 4, marginTop: 6 }}>
                {docs.map((d) => (
                  <div key={d.id} className="o-row" style={{ fontSize: 12 }}>
                    <span style={{ flex: 1 }}>{d.name}</span>
                    <Button size="small" variant="danger" disabled={busy} onClick={() => confirm(`Remove ${d.name}?`) && run(() => removeDocAction({ docId: d.id }), 'Removed.')}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      ) : (
        lockedReason && <p className="faint" style={{ fontSize: 11, margin: '10px 0 0' }}>{lockedReason}</p>
      )}
    </div>
  );
}
