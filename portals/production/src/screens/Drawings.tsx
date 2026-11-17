'use client';
import { useState } from 'react';
import { Button } from '@orbit/ui';
import { DRAWINGS, drawingLimit, drawingType, fmtBytes, fmtDate } from '../config';
import { addDrawingLinkAction, confirmDrawingUploadAction, removeDrawingAction, startDrawingUploadAction } from '../actions';
import { useRun } from './useRun';

// Workshop drawings on a work order: upload (PDF, DWG, DXF, images) with progress, links for
// big files, and the list everyone in Production opens.

export interface DrawingView {
  id: string;
  kind: 'file' | 'link';
  name: string;
  url: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  by?: string;
  createdAt?: string;
}

export const drawingUrl = (d: Pick<DrawingView, 'id' | 'kind' | 'url'>) => (d.kind === 'link' ? (d.url ?? '#') : `/api/production-docs/${d.id}`);
const kindLabel = (d: DrawingView) =>
  d.kind === 'link' ? 'LINK' : d.contentType === 'application/acad' ? 'DWG' : d.contentType === 'image/vnd.dxf' ? 'DXF' : d.contentType?.startsWith('image/') ? 'IMAGE' : 'PDF';

function put(url: string, file: File, type: string, onProgress: (p: number) => void) {
  return new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

/** Checks a file before upload; returns the reason it cannot go, or null. */
export function drawingProblem(f: File): string | null {
  const type = drawingType(f.name, f.type);
  const max = drawingLimit(type);
  if (!max) return 'use PDF, DWG, DXF or an image';
  if (f.size > max) return `over ${fmtBytes(max)}: add a link instead`;
  return null;
}

/** Uploads files to a work order; returns the names that failed with the reason. */
export async function uploadDrawings(workOrderId: string, files: File[], onProgress: (text: string | null) => void) {
  const failed: string[] = [];
  for (const f of files) {
    const problem = drawingProblem(f);
    if (problem) {
      failed.push(`${f.name} (${problem})`);
      continue;
    }
    const type = drawingType(f.name, f.type);
    onProgress(`${f.name}: starting`);
    const start = await startDrawingUploadAction({ workOrderId, fileName: f.name, contentType: type, size: f.size });
    if (!start.ok) {
      failed.push(`${f.name} (${start.error})`);
      continue;
    }
    const ok = await put(start.data.url, f, type, (p) => onProgress(`${f.name}: ${p}%`));
    if (!ok || !(await confirmDrawingUploadAction({ docId: start.data.docId })).ok) failed.push(f.name);
  }
  onProgress(null);
  return failed;
}

export function DrawingList({ docs, empty }: { docs: DrawingView[]; empty: string }) {
  if (!docs.length) return <p className="faint" style={{ margin: 0, fontSize: 12 }}>{empty}</p>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {docs.map((d) => (
        <li key={d.id} className="o-row" style={{ gap: 8, fontSize: 13 }}>
          <span className="faint" style={{ fontSize: 10, minWidth: 40, fontWeight: 700 }}>
            {kindLabel(d)}
          </span>
          <a href={drawingUrl(d)} target="_blank" rel="noopener noreferrer" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.name}>
            {d.name}
          </a>
          {(d.by || d.createdAt) && (
            <span className="faint" style={{ fontSize: 11, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              {[d.kind === 'file' ? fmtBytes(d.sizeBytes) : '', d.by, d.createdAt ? fmtDate(d.createdAt) : ''].filter(Boolean).join(' · ')}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function DrawingsPanel({ workOrderId, docs, customerDocs, canEdit }: { workOrderId: string; docs: DrawingView[]; customerDocs: DrawingView[]; canEdit: boolean }) {
  const { busy, run, toast, router } = useRun();
  const [progress, setProgress] = useState<string | null>(null);
  const [link, setLink] = useState({ name: '', url: '' });
  return (
    <div className="o-panel" style={{ borderLeft: '4px solid var(--steel)' }}>
      <div className="o-panel-head">
        <h2>Workshop drawings</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          {docs.length} of {DRAWINGS.maxFiles}
        </span>
      </div>
      <DrawingList docs={docs} empty={canEdit ? 'No drawings yet. Attach the workshop drawings for the shop floor.' : 'No drawings attached yet. Ask the production engineer.'} />
      {customerDocs.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line-2)' }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            Customer documents from Sales
          </div>
          <DrawingList docs={customerDocs} empty="" />
        </div>
      )}
      {canEdit && (
        <div className="o-stack" style={{ gap: 10, marginTop: 14, borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
          <div className="o-row" style={{ flexWrap: 'wrap' }}>
            <label className="o-btn small" style={{ cursor: progress ? 'wait' : 'pointer', opacity: progress ? 0.6 : 1 }}>
              {progress ? `Uploading ${progress}` : 'Attach drawings'}
              <input
                type="file"
                multiple
                accept={DRAWINGS.accept}
                disabled={!!progress}
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (!files.length) return;
                  const failed = await uploadDrawings(workOrderId, files, setProgress);
                  toast(failed.length ? `Not attached: ${failed.join(', ')}` : 'Drawings attached.', failed.length ? 'bad' : undefined);
                  router.refresh();
                }}
              />
            </label>
            <span className="faint" style={{ fontSize: 11 }}>
              PDF, DWG, DXF up to {fmtBytes(DRAWINGS.maxBytes)}; images up to {fmtBytes(DRAWINGS.maxImageBytes)}. Bigger: add a link.
            </span>
          </div>
          <div className="o-form-row" style={{ alignItems: 'flex-end' }}>
            <label className="o-field">
              Link name
              <input className="o-input" value={link.name} maxLength={160} placeholder="Shop drawings set Rev C" onChange={(e) => setLink({ ...link, name: e.target.value })} />
            </label>
            <label className="o-field" style={{ flex: '2 1 260px' }}>
              Web link (Drive, OneDrive, Dropbox…)
              <input className="o-input" value={link.url} maxLength={2000} placeholder="https://" onChange={(e) => setLink({ ...link, url: e.target.value })} />
            </label>
            <Button size="small" disabled={busy || !link.name.trim() || !link.url.trim()} onClick={async () => (await run(() => addDrawingLinkAction({ workOrderId, ...link }), 'Link added.')) && setLink({ name: '', url: '' })}>
              Add link
            </Button>
          </div>
          {docs.length > 0 && (
            <details>
              <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
                Remove a drawing (e.g. a superseded revision)
              </summary>
              <div className="o-stack" style={{ gap: 4, marginTop: 6 }}>
                {docs.map((d) => (
                  <div key={d.id} className="o-row" style={{ fontSize: 12 }}>
                    <span style={{ flex: 1 }}>{d.name}</span>
                    <Button size="small" variant="danger" disabled={busy} onClick={() => confirm(`Remove ${d.name}?`) && run(() => removeDrawingAction({ docId: d.id }), 'Removed.')}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
