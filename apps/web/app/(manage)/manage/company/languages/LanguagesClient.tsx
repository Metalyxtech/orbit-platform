'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Chip, Field, Select, useToast } from '@orbit/ui';
import { setCompanyLanguagesAction } from './actions';

type Lang = { code: string; name: string; native: string; rtl: boolean; region: string };

export function LanguagesClient({ all, offered, limited }: { all: Lang[]; offered: string[]; limited: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>(offered);
  const [def, setDef] = useState(offered[0] ?? 'en');
  const [busy, setBusy] = useState(false);
  const changed = picked.join() !== offered.join() || def !== offered[0];

  const toggle = (code: string) =>
    code !== 'en' &&
    setPicked((p) => {
      const next = p.includes(code) ? p.filter((c) => c !== code) : [...p, code];
      if (!next.includes(def) && next.length) setDef(next[0]);
      return next;
    });

  async function save() {
    setBusy(true);
    // The default goes first; the rest keep the order of the list.
    const ordered = [def, ...all.map((l) => l.code).filter((c) => c !== def && picked.includes(c))];
    const res = await setCompanyLanguagesAction({ languages: ordered });
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast('Languages saved');
    router.refresh();
  }

  return (
    <>
      <div className="o-panel">
        <h2 style={{ marginTop: 0 }}>Languages your people can choose</h2>
        {limited && (
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            These are the languages enabled for your company. For another language, ask SteelConnect360 support.
          </p>
        )}
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
          {all.map((l) => (
            <label key={l.code} className="o-panel" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, padding: '10px 12px', cursor: 'pointer', borderColor: picked.includes(l.code) ? 'var(--steel)' : undefined }}>
              <input type="checkbox" checked={l.code === 'en' || picked.includes(l.code)} disabled={l.code === 'en'} onChange={() => toggle(l.code)} aria-label={l.name} />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <strong lang={l.code} dir={l.rtl ? 'rtl' : 'ltr'}>
                  {l.native}
                </strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {l.name}
                  {l.code === 'en' ? ' · always available' : l.rtl ? ' · right to left' : ''}
                </span>
              </span>
              {def === l.code && (
                <span style={{ marginLeft: 'auto' }}>
                  <Chip tone="ok">Default</Chip>
                </span>
              )}
            </label>
          ))}
        </div>
      </div>
      <div className="o-panel" style={{ display: 'grid', gap: 12 }}>
        <Field label="Default language" help="New people start in this language. People who never chose one also see it.">
          <Select value={def} options={all.filter((l) => picked.includes(l.code)).map((l) => ({ value: l.code, label: `${l.native} (${l.name})` }))} onChange={setDef} aria-label="Default language" />
        </Field>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {picked.length > 1 ? `${picked.length} languages: people see a language switch at the bottom of the menu.` : 'One language: no language switch is shown.'} If you remove a
          language, people using it move to the default.
        </p>
        <div>
          <Button variant="primary" disabled={busy || !picked.length || !changed} onClick={save}>
            Save languages
          </Button>
        </div>
      </div>
    </>
  );
}
