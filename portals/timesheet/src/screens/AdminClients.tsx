'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SettingsField } from '@orbit/core/portals';
import { Button, DataTable, Field, Segmented, Select, StatusChip, Toggle, TopBar, useToast } from '@orbit/ui';
import {
  addMemberAction,
  decideCorrectionAction,
  exportAction,
  importCsvAction,
  setWorkflowAction,
  updateMemberAction,
  updateSettingsAction,
} from '../actions';
import { timesheetManifest } from '../manifest';
import type { CsvPreviewRow } from '../server/admin';

// ---------- Timesheet settings: generated from manifest.settingsSchema ----------

type Values = Record<string, unknown>;

export function SettingsClient({
  initial,
  workflow,
  workflows,
  timezone,
  companyName,
  projects,
}: {
  initial: Values;
  workflow: { id: string; name: string; version: number; description: string | null };
  workflows: { id: string; name: string; description: string | null; steps: string[] }[];
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
            <WorkflowPicker current={workflow} options={workflows} />
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

// ---------- Projects and cost codes: CSV import with per-row preview ----------

/** Approval flow for the company: a choice from the Orbit library, applied to new submissions. */
function WorkflowPicker({
  current,
  options,
}: {
  current: { id: string; name: string };
  options: { id: string; name: string; description: string | null; steps: string[] }[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [pick, setPick] = useState(current.id);
  const [saving, setSaving] = useState(false);
  const chosen = options.find((o) => o.id === pick);

  async function save() {
    setSaving(true);
    const res = await setWorkflowAction({ workflowDefinitionId: pick });
    setSaving(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast('Approval workflow saved. It applies to timesheets submitted from now on.');
    router.refresh();
  }

  return (
    <div className="o-panel">
      <div className="o-panel-head">
        <h2>Approval workflow</h2>
      </div>
      <label className="o-field">
        Who approves timesheets
        <select className="o-select" value={pick} onChange={(e) => setPick(e.target.value)}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      {chosen && (
        <>
          <ol style={{ margin: '12px 0 8px', paddingLeft: 20, fontSize: 13 }}>
            {chosen.steps.map((st) => (
              <li key={st}>{st}</li>
            ))}
            <li>Approved and locked</li>
          </ol>
          <p className="muted" style={{ fontSize: 12 }}>{chosen.description}</p>
        </>
      )}
      <p className="faint" style={{ fontSize: 12 }}>
        Each person's supervisor is set on <Link href="/timesheet/admin/users">Users</Link>. Each project's manager is set on{' '}
        <Link href="/timesheet/admin/projects">Projects</Link>. If nobody fits a step, a company admin approves.
      </p>
      <Button variant="primary" disabled={saving || pick === current.id} onClick={save}>
        Save workflow
      </Button>
    </div>
  );
}

export function ProjectsClient({ projects }: { projects: { id: string; code: string; name: string; pm: string; costCodes: number; status: string }[] }) {
  const toast = useToast();
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<CsvPreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    const res = await importCsvAction({ csv, dryRun: true });
    if (!res.ok) return toast(res.error, 'bad');
    setError('error' in res.data ? (res.data.error ?? null) : null);
    setPreview(res.data.preview);
  }
  async function doImport() {
    const res = await importCsvAction({ csv, dryRun: false });
    if (!res.ok) return toast(res.error, 'bad');
    if (!res.data.ok) return setPreview(res.data.preview);
    toast(`Imported ${res.data.imported} rows.`);
    setCsv('');
    setPreview(null);
    router.refresh();
  }
  const bad = preview?.some((p) => p.errors.length) ?? true;

  return (
    <>
      <TopBar crumbs={['Timesheet', 'Company admin', 'Projects and cost codes']} />
      <div className="o-page">
        <h1>Projects and cost codes</h1>
        <div className="o-cols-wide">
          <div className="o-panel flush">
            <DataTable
              rows={projects}
              rowKey={(p) => p.id}
              columns={[
                { key: 'c', header: 'Code', render: (p) => <strong>{p.code}</strong> },
                { key: 'n', header: 'Project', render: (p) => p.name },
                { key: 'm', header: 'Project manager', render: (p) => p.pm },
                { key: 'k', header: 'Cost codes', num: true, render: (p) => p.costCodes },
                { key: 's', header: 'Status', render: (p) => <span className={`o-chip ${p.status === 'active' ? 'ok' : ''}`}>{p.status}</span> },
              ]}
            />
          </div>
          <div className="o-panel o-stack" style={{ gap: 10 }}>
            <h2 style={{ margin: 0 }}>Import CSV</h2>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Columns: project_code, project_name, pm_email, cost_code, cost_code_name. Existing projects and cost codes are updated.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCsv(await f.text());
                setPreview(null);
              }}
            />
            <textarea
              className="o-textarea"
              style={{ minHeight: 140, fontFamily: 'monospace', fontSize: 12 }}
              value={csv}
              placeholder="project_code,project_name,pm_email,cost_code,cost_code_name"
              onChange={(e) => {
                setCsv(e.target.value);
                setPreview(null);
              }}
            />
            <div className="o-row">
              <Button disabled={!csv.trim()} onClick={check}>
                Preview
              </Button>
              <Button variant="primary" disabled={!preview || bad} onClick={doImport}>
                Import
              </Button>
            </div>
            {error && <div className="o-banner bad">{error}</div>}
            {preview && (
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                <DataTable
                  rows={preview}
                  rowKey={(p) => String(p.line)}
                  columns={[
                    { key: 'l', header: 'Line', render: (p) => p.line },
                    { key: 'p', header: 'Project', render: (p) => p.projectCode },
                    { key: 'c', header: 'Cost code', render: (p) => p.costCode },
                    {
                      key: 'e',
                      header: 'Check',
                      render: (p) => (p.errors.length ? <span style={{ color: 'var(--bad)' }}>{p.errors.join('; ')}</span> : <span className="o-chip ok">OK</span>),
                    },
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------- Users and correction requests ----------

type UserRow = { membershipId: string; name: string; email: string; role: string; title: string | null; status: string; supervisorId: string | null };
type CorrectionRow = { id: string; employee: string; week: number; reason: string; createdAt: string };

const ROLES = [
  { value: 'employee', label: 'Employee' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'project_manager', label: 'Project manager' },
  { value: 'company_admin', label: 'Company admin' },
] as const;

export function UsersClient({ users, corrections }: { users: UserRow[]; corrections: CorrectionRow[] }) {
  const toast = useToast();
  const router = useRouter();
  const supervisors = users.filter((u) => u.role !== 'employee' && u.status === 'active');

  const [adding, setAdding] = useState(false);

  async function update(input: Parameters<typeof updateMemberAction>[0]) {
    const res = await updateMemberAction(input);
    if (!res.ok) return toast(res.error, 'bad');
    toast('Saved');
    router.refresh();
  }
  async function correction(id: string, approve: boolean) {
    const res = await decideCorrectionAction({ id, approve });
    if (!res.ok) return toast(res.error, 'bad');
    toast(approve ? 'Week reopened as a new revision.' : 'Request declined.');
    router.refresh();
  }

  return (
    <>
      <TopBar crumbs={['Timesheet', 'Company admin', 'Users']} />
      <div className="o-page">
        <div className="o-row" style={{ justifyContent: 'space-between' }}>
          <h1>Users</h1>
          <Button variant="primary" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Close' : 'Add person'}
          </Button>
        </div>
        {adding && <AddPerson supervisors={supervisors} onDone={() => setAdding(false)} />}
        {users.some((u) => u.status === 'pending') && (
          <p className="o-panel" style={{ padding: '10px 16px' }}>
            {users.filter((u) => u.status === 'pending').length} people asked to join. Set their role and supervisor, then approve
            them below.
          </p>
        )}
        {corrections.length > 0 && (
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Correction requests</h2>
            </div>
            <DataTable
              rows={corrections}
              rowKey={(c) => c.id}
              columns={[
                { key: 'e', header: 'Employee', render: (c) => c.employee },
                { key: 'w', header: 'Week', num: true, render: (c) => c.week },
                { key: 'r', header: 'Reason', render: (c) => c.reason },
                {
                  key: 'a',
                  header: '',
                  render: (c) => (
                    <div className="o-row" style={{ justifyContent: 'flex-end' }}>
                      <Button size="small" onClick={() => correction(c.id, false)}>
                        Decline
                      </Button>
                      <Button size="small" variant="primary" onClick={() => correction(c.id, true)}>
                        Reopen week
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
        <div className="o-panel flush" style={{ overflowX: 'auto' }}>
          <DataTable
            rows={users}
            rowKey={(u) => u.membershipId}
            columns={[
              {
                key: 'n',
                header: 'Name',
                render: (u) => (
                  <div>
                    <div>{u.name}</div>
                    <div className="faint" style={{ fontSize: 11 }}>{u.email}</div>
                  </div>
                ),
              },
              {
                key: 't',
                header: 'Title',
                render: (u) => (
                  <input
                    className="o-input"
                    defaultValue={u.title ?? ''}
                    onBlur={(e) => e.target.value !== (u.title ?? '') && update({ membershipId: u.membershipId, title: e.target.value || null })}
                  />
                ),
              },
              {
                key: 'r',
                header: 'Role',
                render: (u) => (
                  <Select
                    value={u.role as (typeof ROLES)[number]['value']}
                    options={[...ROLES]}
                    onChange={(role) => update({ membershipId: u.membershipId, role })}
                  />
                ),
              },
              {
                key: 's',
                header: 'Supervisor',
                render: (u) => (
                  <select
                    className="o-select"
                    value={u.supervisorId ?? ''}
                    onChange={(e) => update({ membershipId: u.membershipId, supervisorId: e.target.value || null })}
                  >
                    <option value="">None (company admin approves)</option>
                    {supervisors
                      .filter((s) => s.membershipId !== u.membershipId)
                      .map((s) => (
                        <option key={s.membershipId} value={s.membershipId}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                ),
              },
              { key: 'st', header: 'Status', render: (u) => <StatusChip status={u.status} /> },
              {
                key: 'a',
                header: '',
                render: (u) =>
                  u.status === 'pending' ? (
                    <div className="o-row">
                      <Button size="small" variant="ok" onClick={() => update({ membershipId: u.membershipId, status: 'active' })}>
                        Approve
                      </Button>
                      <Button size="small" variant="danger" onClick={() => update({ membershipId: u.membershipId, status: 'disabled' })}>
                        Reject
                      </Button>
                    </div>
                  ) : u.status === 'active' ? (
                    <Button size="small" onClick={() => update({ membershipId: u.membershipId, status: 'disabled' })}>
                      Disable
                    </Button>
                  ) : (
                    <Button size="small" onClick={() => update({ membershipId: u.membershipId, status: 'active' })}>
                      Enable
                    </Button>
                  ),
              },
            ]}
          />
        </div>
      </div>
    </>
  );
}

// ---------- Reports: filters + export ----------

export function ReportFilters({ month, projectId, projects }: { month: string; projectId: string; projects: { id: string; label: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    return { value: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  });
  const go = (m: string, p: string) => router.push(`?month=${m}${p ? `&project=${p}` : ''}`);

  async function doExport() {
    const res = await exportAction({ month, projectIds: projectId ? [projectId] : undefined });
    if (!res.ok) return toast(res.error, 'bad');
    toast('Export started. We will email you a download link (valid 24 hours).');
  }

  return (
    <TopBar crumbs={['Timesheet', 'Reports']}>
      <select className="o-select" style={{ width: 170 }} value={month} onChange={(e) => go(e.target.value, projectId)} aria-label="Month">
        {months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select className="o-select" style={{ width: 180 }} value={projectId} onChange={(e) => go(month, e.target.value)} aria-label="Project">
        <option value="">All my projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <Button onClick={doExport}>Export to Excel</Button>
    </TopBar>
  );
}

/** Company admin adds a person; they sign in with that email and land straight in the company. */
function AddPerson({ supervisors, onDone }: { supervisors: UserRow[]; onDone: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function submit(form: FormData) {
    setSaving(true);
    const res = await addMemberAction({
      email: String(form.get('email') ?? ''),
      name: String(form.get('name') ?? ''),
      role: form.get('role') as 'employee',
      title: String(form.get('title') ?? ''),
      supervisorId: (form.get('supervisorId') as string) || null,
    });
    setSaving(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast('Added. They can sign in now with that email.');
    onDone();
    router.refresh();
  }

  return (
    <form action={submit} className="o-panel o-stack" style={{ gap: 12 }}>
      <h2 style={{ margin: 0 }}>Add a person</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label className="o-field">
          Full name
          <input className="o-input" name="name" required minLength={2} maxLength={120} />
        </label>
        <label className="o-field">
          Work email
          <input className="o-input" name="email" type="email" required />
        </label>
        <label className="o-field">
          Role
          <select className="o-select" name="role" defaultValue="employee">
            <option value="employee">Employee</option>
            <option value="supervisor">Supervisor</option>
            <option value="project_manager">Project manager</option>
            <option value="company_admin">Company admin</option>
          </select>
        </label>
        <label className="o-field">
          Job title
          <input className="o-input" name="title" maxLength={100} placeholder="Site engineer" />
        </label>
        <label className="o-field">
          Supervisor
          <select className="o-select" name="supervisorId" defaultValue="">
            <option value="">None (company admin approves)</option>
            {supervisors.map((s) => (
              <option key={s.membershipId} value={s.membershipId}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="o-row">
        <Button variant="primary" type="submit" disabled={saving}>
          Add person
        </Button>
        <span className="faint" style={{ fontSize: 12 }}>
          They sign in at the Orbit address with this email. No invite email is sent yet.
        </span>
      </div>
    </form>
  );
}
