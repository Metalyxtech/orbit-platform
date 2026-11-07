'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button, useToast } from '@orbit/ui';
import { confirmCustomUploadAction, createCustomRequestAction, startCustomUploadAction } from './actions';

const ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,.docx,.xlsx,.csv';
const MAX = 10 * 1024 * 1024;

/** New custom requirement: what is needed, which area, and the customer's forms as files. */
export function CustomRequestForm({ areas }: { areas: { id: string; label: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  function pick(list: FileList | null) {
    const all = Array.from(list ?? []);
    const bad = all.filter((f) => !f.type || f.size > MAX);
    if (bad.length) toast(`${bad.map((f) => f.name).join(', ')}: use images, PDF, Word or Excel up to 10 MB each.`, 'bad');
    setFiles((cur) => [...cur, ...all.filter((f) => f.type && f.size <= MAX)].slice(0, 20));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy('Sending…');
    const res = await createCustomRequestAction({ title: String(fd.get('title') ?? ''), details: String(fd.get('details') ?? ''), area: String(fd.get('area') ?? 'other') });
    if (!res.ok) {
      setBusy(null);
      return toast(res.error, 'bad');
    }
    let done = 0;
    const failed: string[] = [];
    for (const f of files) {
      setBusy(`Uploading ${done + 1} of ${files.length}: ${f.name}`);
      const up = await startCustomUploadAction({ requestId: res.data.id, fileName: f.name, contentType: f.type, size: f.size });
      if (!up.ok) {
        failed.push(f.name);
        continue;
      }
      const put = await fetch(up.data.url, { method: 'PUT', headers: { 'Content-Type': f.type }, body: f }).catch(() => null);
      if (put?.ok) {
        await confirmCustomUploadAction({ fileId: up.data.fileId });
        done++;
      } else failed.push(f.name);
    }
    setBusy(null);
    form.current?.reset();
    setFiles([]);
    toast(failed.length ? `Sent to Orbit, but these files did not upload: ${failed.join(', ')}. Send them again in a new request.` : `Sent to Orbit${done ? ` with ${done} file${done > 1 ? 's' : ''}` : ''}.`, failed.length ? 'bad' : undefined);
    router.refresh();
  }

  return (
    <form ref={form} onSubmit={submit} className="o-stack" style={{ gap: 12 }}>
      <label className="o-field">
        Title
        <input className="o-input" name="title" required minLength={3} maxLength={160} placeholder="e.g. Fabrication job card form" />
      </label>
      <label className="o-field">
        It is about
        <select className="o-select" name="area" defaultValue="new">
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <label className="o-field">
        What you need
        <textarea
          className="o-input"
          name="details"
          required
          minLength={10}
          maxLength={8000}
          rows={6}
          placeholder="Describe the form or change: the fields, who fills it in, who approves it and in what order, and any reports you need."
        />
      </label>
      <div className="o-field">
        Your forms (photos, scans, PDF, Word or Excel; up to 10 MB each, 20 files)
        <input className="o-input" type="file" multiple accept={ACCEPT} onChange={(e) => pick(e.target.files)} />
        {files.length > 0 && (
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                {f.name} <span className="faint">({Math.max(1, Math.round(f.size / 1024))} KB)</span>{' '}
                <button type="button" className="o-link" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} style={{ border: 0, background: 'none', color: 'var(--bad)', cursor: 'pointer' }}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="o-row" style={{ gap: 10 }}>
        <Button type="submit" variant="primary" disabled={!!busy}>
          Send to Orbit
        </Button>
        {busy && <span className="faint" style={{ fontSize: 12 }}>{busy}</span>}
      </div>
    </form>
  );
}
