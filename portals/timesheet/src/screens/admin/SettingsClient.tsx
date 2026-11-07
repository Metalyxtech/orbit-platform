'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type SettingsField } from '@orbit/core/portals';
import { Button, DataTable, Field, Segmented, Select, Toggle, TopBar, useToast } from '@orbit/ui';
import { updateSettingsAction } from '../../actions';
import { timesheetManifest } from '../../manifest';
import type { Values } from './types';

// Timesheet settings: generated from manifest.settingsSchema.

export function SettingsClient({
  initial,
  workflow,
  timezone,
  companyName,
  projects,
}: {
  initial: Values;
  workflow: { id: string; name: string; version: number; description: string | null };
  timezone: string;
  companyName: string;
  projects: { id: string; code: string; name: string; pm: string; costCodes: number }[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: unknown) => setValues((p) => ({ ...p, [k]: v }));

  function input(f: SettingsField) {
    const v = values[f.key];
    switch (f.type) {
      case 'segmented':
        return <Segmented value={v as string | number} options={f.options} onChange={(x) => set(f.key, x)} />;
      case 'select':
        if (f.multiple) {
          const arr = (v as (string | number)[]) ?? [];
          return (
            <div className="o-seg" role="group" aria-label={f.label}>
              {f.options.map((o) => (
                <button
                  type="button"
                  key={String(o.value)}
                  aria-pressed={arr.includes(o.value)}
                  onClick={() => set(f.key, arr.includes(o.value) ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                >
                  {o.label.slice(0, 3)}
                </button>
              ))}
            </div>
          );
        }
        return <Select value={v as string | number} options={f.options} onChange={(x) => set(f.key, x)} />;
      case 'number':
        return (
          <input
            className="o-input"
            type="number"
            step={f.step}
            min={f.min}
            max={f.max}
            value={String(v ?? '')}
            onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))}
          />
        );
      case 'time':
        return <input className="o-input" type="time" value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} />;
      case 'toggle':
        return null;
    }
  }

  async function save() {
    setSaving(true);
    const res = await updateSettingsAction(values);
    setSaving(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast('Settings saved. They apply from the next week that starts.');
    router.refresh();
  }

  return (
    <>
      <TopBar crumbs={['Timesheet', 'Company admin', 'Timesheet settings']}>
        <Button onClick={() => setValues(initial)}>Discard</Button>
        <Button variant="primary" disabled={saving} onClick={save}>
          Save settings
        </Button>
      </TopBar>
      <div className="o-page">
        <div>
          <h1>Timesheet settings</h1>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            These rules apply to everyone in {companyName}. Changes apply from the next week that starts. Time zone: {timezone}.
          </p>
        </div>
        <div className="o-cols-wide">
          <div className="o-panel o-stack">
            {timesheetManifest.settingsSchema.groups.map((g) => (
              <section key={g.title} className="o-stack" style={{ gap: 10 }}>
                <h2 style={{ margin: 0 }}>{g.title}</h2>
                <div className="o-grid2">
                  {g.fields
                    .filter((f) => f.type !== 'toggle')
                    .map((f) => (
                      <Field key={f.key} label={f.label} help={f.help}>
                        {input(f)}
                      </Field>
                    ))}
                </div>
                {g.fields
                  .filter((f) => f.type === 'toggle')
                  .map((f) => (
                    <Toggle key={f.key} label={f.label} checked={!!values[f.key]} onChange={(x) => set(f.key, x)} />
                  ))}
              </section>
            ))}
          </div>
          <div className="o-stack">
            <div className="o-panel">
              <div className="o-panel-head">
                <h2>Approval workflow</h2>
                <Link className="o-btn small" href="/timesheet/admin/workflow">
                  Change
                </Link>
              </div>
              <strong>{workflow.name}</strong>
              <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
                {workflow.description}
              </p>
            </div>
            <div className="o-panel flush">
              <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                <h2>Projects and cost codes</h2>
                <Link className="o-btn small" href="/timesheet/admin/projects">
                  Import CSV
                </Link>
              </div>
              <DataTable
                rows={projects}
                rowKey={(p) => p.id}
                columns={[
                  { key: 'p', header: 'Project', render: (p) => `${p.code} ${p.name}` },
                  { key: 'm', header: 'Project manager', render: (p) => p.pm },
                  { key: 'c', header: 'Cost codes', num: true, render: (p) => p.costCodes },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
