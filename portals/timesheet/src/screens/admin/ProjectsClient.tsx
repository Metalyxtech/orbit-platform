'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, DataTable, TopBar, useToast } from '@orbit/ui';
import { importCsvAction, saveCostCodeAction, saveProjectAction } from '../../actions';
import type { CsvPreviewRow } from '../../server/admin';
import type { ProjectRow, Manager } from './types';

// Projects and cost codes, with CSV import and per-row preview.

export function ProjectsClient({ projects, managers }: { projects: ProjectRow[]; managers: Manager[] }) {
  const [adding, setAdding] = useState(projects.length === 0);
  const [showClosed, setShowClosed] = useState(false);
  const shown = projects.filter((p) => showClosed || p.status === 'active');
  const closed = projects.length - projects.filter((p) => p.status === 'active').length;

  return (
    <>
      <TopBar crumbs={['Timesheet', 'Company admin', 'Projects and cost codes']}>
        <Button variant="primary" onClick={() => setAdding((a) => !a)}>
          {adding ? 'Close' : 'Add project'}
        </Button>
      </TopBar>
      <div className="o-page">
        <div>
          <h1>Projects and cost codes</h1>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            People book hours against a project and a cost code. The project manager approves the project step of the
            workflow.
          </p>
        </div>
        {adding && <ProjectForm managers={managers} onDone={() => setAdding(false)} />}
        {projects.length === 0 && !adding && <EmptyProjects />}
        {shown.map((p) => (
          <ProjectPanel key={p.id} project={p} managers={managers} />
        ))}
        {closed > 0 && (
          <button className="o-btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? 'Hide closed projects' : `Show ${closed} closed projects`}
          </button>
        )}
        <details className="o-panel">
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Import many from a CSV file</summary>
          <CsvImport />
        </details>
      </div>
    </>
  );
}

function EmptyProjects() {
  return <div className="o-panel o-empty">No projects yet. Click Add project to create the first one.</div>;
}

function ProjectForm({ managers, project, onDone }: { managers: Manager[]; project?: ProjectRow; onDone: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function submit(form: FormData) {
    setSaving(true);
    const res = await saveProjectAction({
      id: project?.id,
      code: String(form.get('code') ?? ''),
      name: String(form.get('name') ?? ''),
      pmId: (form.get('pmId') as string) || null,
    });
    setSaving(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast(project ? 'Project saved.' : 'Project added. Now add its cost codes.');
    onDone();
    router.refresh();
  }

  return (
    <form action={submit} className="o-panel o-stack" style={{ gap: 12 }}>
      {!project && <h2 style={{ margin: 0 }}>New project</h2>}
      <div className="o-form-row">
        <label className="o-field">
          Project code
          <input className="o-input" name="code" required maxLength={40} defaultValue={project?.code} placeholder="J07567" />
        </label>
        <label className="o-field" style={{ flex: 2 }}>
          Project name
          <input className="o-input" name="name" required minLength={2} maxLength={160} defaultValue={project?.name} placeholder="Loch Striven Platform" />
        </label>
        <label className="o-field">
          Project manager
          <select className="o-select" name="pmId" defaultValue={project?.pmId ?? ''}>
            <option value="">None (company admin approves)</option>
            {managers.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="o-row">
        <Button variant="primary" type="submit" disabled={saving}>
          {project ? 'Save project' : 'Add project'}
        </Button>
        <Button onClick={onDone}>Cancel</Button>
        {managers.length === 0 && (
          <span className="faint" style={{ fontSize: 12 }}>
            Tip: give someone the Project manager role on Users to pick them here.
          </span>
        )}
      </div>
    </form>
  );
}

function ProjectPanel({ project: p, managers }: { project: ProjectRow; managers: Manager[] }) {
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  async function setStatus(status: 'active' | 'closed') {
    const res = await saveProjectAction({ id: p.id, code: p.code, name: p.name, pmId: p.pmId, status });
    if (!res.ok) return toast(res.error, 'bad');
    toast(status === 'closed' ? 'Project closed. It no longer appears in timesheets.' : 'Project reopened.');
    router.refresh();
  }
  async function saveCode(input: { id?: string; code: string; name: string; active?: boolean }) {
    const res = await saveCostCodeAction({ ...input, projectId: p.id });
    if (!res.ok) {
      toast(res.error, 'bad');
      return false;
    }
    router.refresh();
    return true;
  }

  if (editing) return <ProjectForm managers={managers} project={p} onDone={() => setEditing(false)} />;
  return (
    <div className="o-panel flush" style={{ opacity: p.status === 'active' ? 1 : 0.7 }}>
      <div className="o-panel-head" style={{ padding: '12px 16px 0', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>
            {p.code} <span style={{ fontWeight: 400 }}>{p.name}</span>
          </h2>
          <div className="faint" style={{ fontSize: 12 }}>
            Project manager: {p.pm} · {p.costCodes} active cost codes
          </div>
        </div>
        <div className="o-row">
          {p.status !== 'active' && <span className="o-chip">Closed</span>}
          <Button size="small" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {p.status === 'active' ? (
            <Button size="small" onClick={() => setStatus('closed')}>
              Close project
            </Button>
          ) : (
            <Button size="small" onClick={() => setStatus('active')}>
              Reopen
            </Button>
          )}
        </div>
      </div>
      <div className="o-scroll">
        <table className="o-table">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Cost code</th>
              <th>Description</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: 110 }} />
            </tr>
          </thead>
          <tbody>
            {p.codes.map((c) => (
              <tr key={c.id} style={{ opacity: c.active ? 1 : 0.6 }}>
                <td>
                  <strong>{c.code}</strong>
                </td>
                <td>{c.name}</td>
                <td>{c.active ? <span className="o-chip ok">Active</span> : <span className="o-chip">Off</span>}</td>
                <td style={{ textAlign: 'right' }}>
                  <Button size="small" onClick={() => saveCode({ id: c.id, code: c.code, name: c.name, active: !c.active })}>
                    {c.active ? 'Turn off' : 'Turn on'}
                  </Button>
                </td>
              </tr>
            ))}
            {p.status === 'active' && <AddCostCodeRow onAdd={(code, name) => saveCode({ code, name })} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddCostCodeRow({ onAdd }: { onAdd: (code: string, name: string) => Promise<boolean> }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  async function add() {
    setSaving(true);
    const ok = await onAdd(code, name);
    setSaving(false);
    if (ok) {
      setCode('');
      setName('');
    }
  }
  return (
    <tr>
      <td>
        <input className="o-input" aria-label="New cost code" placeholder="5120" value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} />
      </td>
      <td>
        <input
          className="o-input"
          aria-label="New cost code description"
          placeholder="Fabrication, structural steel"
          value={name}
          maxLength={160}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && code.trim() && name.trim().length >= 2) add();
          }}
        />
      </td>
      <td />
      <td style={{ textAlign: 'right' }}>
        <Button size="small" variant="primary" disabled={saving || !code.trim() || name.trim().length < 2} onClick={add}>
          Add code
        </Button>
      </td>
    </tr>
  );
}

function CsvImport() {
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
    <div className="o-stack" style={{ gap: 10, marginTop: 12 }}>
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
  );
}
