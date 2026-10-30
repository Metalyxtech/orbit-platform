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
  saveCostCodeAction,
  saveCustomWorkflowAction,
  saveProjectAction,
  setWorkflowAction,
  updateMemberAction,
  updateSettingsAction,
} from '../actions';
import { timesheetManifest } from '../manifest';
import type { CsvPreviewRow, CustomWorkflowInput } from '../server/admin';
import type { ApproverRule, CellRule, Condition, WorkflowDefinition } from '@orbit/core/workflow';

// ---------- Timesheet settings: generated from manifest.settingsSchema ----------

type Values = Record<string, unknown>;

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

// ---------- Projects and cost codes: CSV import with per-row preview ----------

type WorkflowOption = { id: string; name: string; description: string | null; steps: string[]; custom: boolean };
type Member = { membershipId: string; name: string; role: string; title: string | null };

/** Company admin > Approval workflow: pick a flow from the Orbit library and see who approves whom. */
export function WorkflowClient({
  current,
  custom,
  members,
  options,
  people,
  projects,
}: {
  current: { id: string; name: string; definition: WorkflowDefinition };
  custom: { name: string; definition: WorkflowDefinition } | null;
  members: Member[];
  options: WorkflowOption[];
  people: { name: string; role: string; supervisor: string | null }[];
  projects: { code: string; name: string; pm: string | null }[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [pick, setPick] = useState(current.id);
  const [saving, setSaving] = useState(false);
  const chosen = options.find((o) => o.id === pick);
  // A company matrix can use either per person, so both tables stay active for it.
  const usesPm = !!chosen?.custom || (chosen?.steps.some((st) => st.startsWith('Project managers')) ?? false);
  const usesSupervisor = !!chosen?.custom || (chosen?.steps.some((st) => st.startsWith('Supervisor')) ?? false);
  const noSupervisor = people.filter((p) => p.role !== 'company_admin' && !p.supervisor);
  const noPm = projects.filter((p) => !p.pm);

  async function save() {
    setSaving(true);
    const res = await setWorkflowAction({ workflowDefinitionId: pick });
    setSaving(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast('Approval workflow saved. It applies to timesheets submitted from now on.');
    router.refresh();
  }

  return (
    <>
      <TopBar crumbs={['Timesheet', 'Company admin', 'Approval workflow']}>
        <Button onClick={() => setPick(current.id)} disabled={pick === current.id}>
          Discard
        </Button>
        <Button variant="primary" disabled={saving || pick === current.id} onClick={save}>
          Save workflow
        </Button>
      </TopBar>
      <div className="o-page">
        <div>
          <h1>Approval workflow</h1>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Choose who approves timesheets. The change applies to timesheets submitted after you save; ones already in approval
            keep their route.
          </p>
        </div>

        <div className="o-wf-grid" role="radiogroup" aria-label="Approval workflow">
          {[...options].sort((a, b) => Number(b.custom) - Number(a.custom)).map((o) => (
            <label key={o.id} className={`o-wf-card ${pick === o.id ? 'on' : ''}`}>
              <input type="radio" name="workflow" value={o.id} checked={pick === o.id} onChange={() => setPick(o.id)} />
              <div className="o-row" style={{ justifyContent: 'space-between' }}>
                <strong>{o.name}</strong>
                <span className="o-row" style={{ gap: 4 }}>
                  {o.custom && <span className="o-chip hivis">Your company</span>}
                  {o.id === current.id && <span className="o-chip ok">In use</span>}
                </span>
              </div>
              <div className="o-wf-steps">
                {o.steps.map((st, i) => (
                  <span key={st} className="o-row" style={{ gap: 6 }}>
                    {i > 0 && <span className="faint">→</span>}
                    <span className="o-chip">{st}</span>
                  </span>
                ))}
                <span className="faint">→</span>
                <span className="o-chip ok">Approved</span>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>{o.description}</p>
            </label>
          ))}
        </div>

        <WorkflowBuilder current={current} custom={custom} members={members} />

        <h2 style={{ margin: '8px 0 0' }}>Who approves whom</h2>
        <div className="o-half">
          <div className="o-panel flush" style={{ opacity: usesSupervisor ? 1 : 0.55 }}>
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Supervisor step</h2>
              <Link className="o-btn small" href="/timesheet/admin/users">
                Edit on Users
              </Link>
            </div>
            {!usesSupervisor && <p className="faint" style={{ fontSize: 12, padding: '0 16px' }}>This workflow has no supervisor step.</p>}
            <DataTable
              rows={people}
              rowKey={(p) => p.name + p.role}
              empty={<span className="faint">No people yet.</span>}
              columns={[
                { key: 'n', header: 'Person', render: (p) => p.name },
                {
                  key: 's',
                  header: 'Approved by',
                  render: (p) => p.supervisor ?? <span className="faint">Company admin</span>,
                },
              ]}
            />
          </div>
          <div className="o-panel flush" style={{ opacity: usesPm ? 1 : 0.55 }}>
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Project manager step</h2>
              <Link className="o-btn small" href="/timesheet/admin/projects">
                Edit on Projects
              </Link>
            </div>
            {!usesPm && <p className="faint" style={{ fontSize: 12, padding: '0 16px' }}>This workflow has no project manager step.</p>}
            <DataTable
              rows={projects}
              rowKey={(p) => p.code}
              empty={<span className="faint">No projects yet. Add them on Projects and cost codes.</span>}
              columns={[
                {
                  key: 'p',
                  header: 'Project',
                  render: (p) => (
                    <div>
                      <strong>{p.code}</strong> {p.name}
                    </div>
                  ),
                },
                { key: 'm', header: 'Approved by', render: (p) => p.pm ?? <span className="faint">Company admin</span> },
              ]}
            />
          </div>
        </div>
        {(usesSupervisor && noSupervisor.length > 0) || (usesPm && noPm.length > 0) ? (
          <div className="o-banner info">
            {usesSupervisor && noSupervisor.length > 0 &&
              `${noSupervisor.length} ${noSupervisor.length === 1 ? 'person has' : 'people have'} no supervisor. `}
            {usesPm && noPm.length > 0 && `${noPm.length} ${noPm.length === 1 ? 'project has' : 'projects have'} no project manager. `}
            A company admin approves those steps.
          </div>
        ) : null}
      </div>
    </>
  );
}

type CostCodeRow = { id: string; code: string; name: string; active: boolean };
type ProjectRow = { id: string; code: string; name: string; pm: string; pmId: string | null; status: string; costCodes: number; codes: CostCodeRow[] };
type Manager = { membershipId: string; name: string; role: string };

/** Company admin > Projects and cost codes: add and edit by hand, or import many from CSV. */
// ---------- Approval matrix builder ----------

type Mode = 'default' | 'skip' | 'supervisor' | 'project_managers' | 'role';
type Cell = { mode: Mode; role: 'supervisor' | 'project_manager' | 'company_admin'; membershipId: string };
type Level = { key: number; name: string; conditional: boolean; overtimeAbove: number; slaHours: number };
type MatrixRow = { key: number; membershipId: string; cells: Cell[] };

const ROLE_NAME: Record<string, string> = {
  supervisor: 'Supervisor',
  project_manager: 'Project manager',
  company_admin: 'Company admin',
  employee: 'Employee',
};
const SLA = [8, 24, 48, 72, 120];
let uid = 0;
const cell = (mode: Mode, extra: Partial<Cell> = {}): Cell => ({ mode, role: 'company_admin', membershipId: '', ...extra });
const level = (name: string, extra: Partial<Level> = {}): Level => ({ key: ++uid, name, conditional: false, overtimeAbove: 6, slaHours: 24, ...extra });

function cellFromRule(rule: CellRule | undefined, members: Member[]): Cell {
  if (!rule) return cell('skip');
  if (rule.type === 'supervisor' || rule.type === 'project_managers') return cell(rule.type);
  if (rule.type === 'role') return cell('role', { role: rule.role === 'employee' ? 'company_admin' : rule.role });
  const m = members.find((x) => x.membershipId === rule.membershipId);
  const role = m && m.role !== 'employee' ? (m.role as Cell['role']) : 'company_admin';
  return cell('role', { role, membershipId: rule.membershipId });
}

function ruleFromCell(c: Cell): CustomWorkflowInput['rows'][number]['cells'][number] {
  if (c.mode === 'skip' || c.mode === 'default') return null;
  if (c.mode === 'supervisor' || c.mode === 'project_managers') return { type: c.mode };
  return c.membershipId ? { type: 'person', membershipId: c.membershipId } : { type: 'role', role: c.role };
}

/** Conditions on a stored step: the overtime threshold and the submitters it skips or targets. */
function readWhen(when: Condition | undefined) {
  const list = !when ? [] : 'all' in when ? when.all : 'any' in when ? when.any : [when];
  const ot = list.find((c) => 'field' in c && c.field === 'overtimeHours') as { value: number } | undefined;
  const who = list.find((c) => 'submitter' in c) as { submitter: 'in' | 'notIn'; ids: string[] } | undefined;
  return { ot, who };
}

/** Rebuilds the editable matrix from a stored definition (library flows become an "everyone" row). */
function matrixFrom(def: WorkflowDefinition, members: Member[]): { levels: Level[]; rows: MatrixRow[] } {
  const levels = def.steps.map((st) => {
    const { ot } = readWhen(st.when);
    return level(st.name, { conditional: !!ot, overtimeAbove: ot?.value ?? 6, slaHours: st.slaHours });
  });
  const ids = new Set<string>();
  for (const st of def.steps) {
    if (st.approver.type === 'matrix') Object.keys(st.approver.cells).forEach((k) => k !== '*' && ids.add(k));
    readWhen(st.when).who?.ids.forEach((i) => ids.add(i));
  }
  const cellsFor = (id: string) =>
    def.steps.map((st) => {
      const a: ApproverRule = st.approver;
      const { who } = readWhen(st.when);
      if (id === '*') {
        if (who?.submitter === 'in') return cell('skip');
        return cellFromRule(a.type === 'matrix' ? a.cells['*'] : a, members);
      }
      if (who && (who.submitter === 'notIn' ? who.ids.includes(id) : !who.ids.includes(id))) return cell('skip');
      return a.type === 'matrix' && a.cells[id] ? cellFromRule(a.cells[id], members) : cell('default');
    });
  return {
    levels,
    rows: [{ key: ++uid, membershipId: '*', cells: cellsFor('*') }, ...[...ids].filter((id) => members.some((m) => m.membershipId === id)).map((id) => ({ key: ++uid, membershipId: id, cells: cellsFor(id) }))],
  };
}

function CellEditor({ value, isDefault, members, onChange, label }: { value: Cell; isDefault: boolean; members: Member[]; onChange: (c: Cell) => void; label: string }) {
  const holders = members.filter((m) => m.role === value.role);
  const modeValue = value.mode === 'role' ? `role:${value.role}` : value.mode;
  return (
    <div className="o-cell">
      <select
        className="o-select"
        aria-label={`${label} approver`}
        value={modeValue}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v.startsWith('role:') ? cell('role', { role: v.slice(5) as Cell['role'] }) : cell(v as Mode));
        }}
      >
        {!isDefault && <option value="default">Same as everyone else</option>}
        <option value="supervisor">Their supervisor</option>
        <option value="project_managers">Project's managers</option>
        <option value="role:supervisor">Supervisor</option>
        <option value="role:project_manager">Project manager</option>
        <option value="role:company_admin">Company admin</option>
        <option value="skip">Skip this level</option>
      </select>
      {value.mode === 'role' && (
        <select className="o-select" aria-label={`${label} person`} value={value.membershipId} onChange={(e) => onChange({ ...value, membershipId: e.target.value })}>
          <option value="">Any {ROLE_NAME[value.role].toLowerCase()}</option>
          {holders.map((m) => (
            <option key={m.membershipId} value={m.membershipId}>
              {m.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function WorkflowBuilder({
  current,
  custom,
  members,
}: {
  current: { name: string; definition: WorkflowDefinition };
  custom: { name: string; definition: WorkflowDefinition } | null;
  members: Member[];
}) {
  const toast = useToast();
  const router = useRouter();
  const start = () =>
    custom ? matrixFrom(custom.definition, members) : { levels: [level('1st approval')], rows: [{ key: ++uid, membershipId: '*', cells: [cell('supervisor')] }] };
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(custom?.name ?? 'Our approval matrix');
  const [levels, setLevels] = useState<Level[]>(() => start().levels);
  const [rows, setRows] = useState<MatrixRow[]>(() => start().rows);
  const [adding, setAdding] = useState('');
  const [saving, setSaving] = useState(false);
  const byId = new Map(members.map((m) => [m.membershipId, m]));
  const free = members.filter((m) => !rows.some((r) => r.membershipId === m.membershipId));

  const setLevel = (j: number, patch: Partial<Level>) => setLevels((l) => l.map((x, i) => (i === j ? { ...x, ...patch } : x)));
  const setCell = (ri: number, j: number, c: Cell) =>
    setRows((r) => r.map((row, i) => (i === ri ? { ...row, cells: row.cells.map((x, k) => (k === j ? c : x)) } : row)));
  function addLevel() {
    setLevels((l) => [...l, level(l.length === 0 ? '1st approval' : l.length === 1 ? '2nd approval' : `Approval ${l.length + 1}`)]);
    setRows((r) => r.map((row) => ({ ...row, cells: [...row.cells, row.membershipId === '*' ? cell('role', { role: 'company_admin' }) : cell('default')] })));
  }
  function removeLevel(j: number) {
    setLevels((l) => l.filter((_, i) => i !== j));
    setRows((r) => r.map((row) => ({ ...row, cells: row.cells.filter((_, k) => k !== j) })));
  }
  function moveLevel(j: number, d: -1 | 1) {
    const swap = <T,>(a: T[]) => {
      const n = [...a];
      [n[j], n[j + d]] = [n[j + d], n[j]];
      return n;
    };
    setLevels((l) => swap(l));
    setRows((r) => r.map((row) => ({ ...row, cells: swap(row.cells) })));
  }
  function addRow() {
    if (!adding) return;
    setRows((r) => [...r, { key: ++uid, membershipId: adding, cells: levels.map(() => cell('default')) }]);
    setAdding('');
  }
  function reset(from: WorkflowDefinition) {
    const m = matrixFrom(from, members);
    setLevels(m.levels);
    setRows(m.rows);
  }

  async function save() {
    const def = rows[0].cells;
    const input: CustomWorkflowInput = {
      name,
      levels: levels.map((l) => ({ name: l.name, overtimeAbove: l.conditional ? l.overtimeAbove : null, slaHours: l.slaHours })),
      rows: rows.map((r) => ({
        membershipId: r.membershipId,
        cells: r.cells.map((c, j) => ruleFromCell(c.mode === 'default' ? def[j] : c)),
      })),
    };
    setSaving(true);
    const res = await saveCustomWorkflowAction(input);
    setSaving(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast('Approval matrix saved and in use for new submissions.');
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="o-panel o-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Approval matrix</h2>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Set approval levels as columns and employees as rows. Choose a role and the exact person for each approval.
          </p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          {custom ? 'Edit approval matrix' : 'Build approval matrix'}
        </Button>
      </div>
    );
  }

  return (
    <div className="o-panel flush">
      <div className="o-panel-head" style={{ padding: '12px 16px 0', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Approval matrix</h2>
        <div className="o-row">
          <Button size="small" onClick={() => reset(current.definition)}>
            Start from {current.name}
          </Button>
          <Button size="small" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
      <div className="o-row" style={{ padding: '0 16px 12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="o-field" style={{ minWidth: 260 }}>
          Matrix name
          <input className="o-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="faint" style={{ fontSize: 12, margin: 0, flex: 1, minWidth: 240 }}>
          Approvals run left to right. "Everyone else" covers people without their own row. A skipped cell means that person
          goes straight to the next level.
        </p>
      </div>
      <div className="o-scroll">
        <table className="o-table o-matrix">
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>Employee</th>
              {levels.map((l, j) => (
                <th key={l.key} style={{ minWidth: 230 }}>
                  <div className="o-stack" style={{ gap: 6 }}>
                    <div className="o-row" style={{ gap: 4 }}>
                      <span className="o-chip">{j + 1}</span>
                      <input className="o-input" aria-label={`Level ${j + 1} name`} value={l.name} maxLength={60} onChange={(e) => setLevel(j, { name: e.target.value })} />
                    </div>
                    <div className="o-row" style={{ gap: 4 }}>
                      <select className="o-select" aria-label={`Level ${j + 1} condition`} value={l.conditional ? 'ot' : 'always'} onChange={(e) => setLevel(j, { conditional: e.target.value === 'ot' })}>
                        <option value="always">Always</option>
                        <option value="ot">If overtime above</option>
                      </select>
                      {l.conditional && (
                        <input
                          className="o-input"
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          aria-label={`Level ${j + 1} overtime hours`}
                          value={l.overtimeAbove}
                          onChange={(e) => setLevel(j, { overtimeAbove: Number(e.target.value) })}
                          style={{ width: 64 }}
                        />
                      )}
                    </div>
                    <div className="o-row" style={{ gap: 4 }}>
                      <select className="o-select" aria-label={`Level ${j + 1} reply within`} value={l.slaHours} onChange={(e) => setLevel(j, { slaHours: Number(e.target.value) })}>
                        {SLA.map((h) => (
                          <option key={h} value={h}>
                            Reply within {h < 24 ? `${h} h` : `${h / 24} day${h > 24 ? 's' : ''}`}
                          </option>
                        ))}
                      </select>
                      <Button size="small" aria-label="Move level left" disabled={j === 0} onClick={() => moveLevel(j, -1)}>
                        ←
                      </Button>
                      <Button size="small" aria-label="Move level right" disabled={j === levels.length - 1} onClick={() => moveLevel(j, 1)}>
                        →
                      </Button>
                      <Button size="small" variant="danger" aria-label="Remove level" disabled={levels.length === 1} onClick={() => removeLevel(j)}>
                        ×
                      </Button>
                    </div>
                  </div>
                </th>
              ))}
              <th style={{ width: 150, verticalAlign: 'middle' }}>
                <Button size="small" disabled={levels.length >= 6} onClick={addLevel}>
                  + Add level
                </Button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const m = byId.get(r.membershipId);
              const who = r.membershipId === '*' ? 'Everyone else' : (m?.name ?? 'Former member');
              return (
                <tr key={r.key} className={r.membershipId === '*' ? 'o-matrix-default' : ''}>
                  <td>
                    <strong>{who}</strong>
                    <div className="faint" style={{ fontSize: 11 }}>
                      {r.membershipId === '*' ? 'Default for people without their own row' : `${ROLE_NAME[m?.role ?? 'employee']}${m?.title ? `, ${m.title}` : ''}`}
                    </div>
                  </td>
                  {r.cells.map((c, j) => (
                    <td key={levels[j]?.key ?? j}>
                      <CellEditor value={c} isDefault={r.membershipId === '*'} members={members} label={`${who}, level ${j + 1}`} onChange={(v) => setCell(ri, j, v)} />
                    </td>
                  ))}
                  <td>
                    {r.membershipId !== '*' && (
                      <Button size="small" variant="danger" aria-label={`Remove ${who}`} onClick={() => setRows((x) => x.filter((_, i) => i !== ri))}>
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={levels.length + 2}>
                <div className="o-row" style={{ flexWrap: 'wrap' }}>
                  <select className="o-select" aria-label="Employee to add" value={adding} onChange={(e) => setAdding(e.target.value)} style={{ maxWidth: 320 }}>
                    <option value="">Choose an employee to add a row</option>
                    {free.map((m) => (
                      <option key={m.membershipId} value={m.membershipId}>
                        {m.name} ({ROLE_NAME[m.role]})
                      </option>
                    ))}
                  </select>
                  <Button disabled={!adding} onClick={addRow}>
                    + Add employee row
                  </Button>
                  {free.length > 0 && (
                    <Button
                      onClick={() =>
                        setRows((r) => [...r, ...free.map((m) => ({ key: ++uid, membershipId: m.membershipId, cells: levels.map(() => cell('default')) }))])
                      }
                    >
                      Add all {free.length}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="o-row" style={{ padding: 16, justifyContent: 'flex-end' }}>
        <Button onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="primary" disabled={saving} onClick={save}>
          Save and use this matrix
        </Button>
      </div>
    </div>
  );
}

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
