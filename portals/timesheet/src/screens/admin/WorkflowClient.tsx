'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, DataTable, TopBar, useToast } from '@orbit/ui';
import { saveCustomWorkflowAction, setWorkflowAction } from '../../actions';
import type { CustomWorkflowInput } from '../../server/admin';
import type { ApproverRule, CellRule, Condition, WorkflowDefinition } from '@orbit/core/workflow';
import type { WorkflowOption, Member, Mode, CellRole, Cell, Level, MatrixRow } from './types';

// Approval workflow: library choice and the approval matrix builder.

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


/** Company admin > Projects and cost codes: add and edit by hand, or import many from CSV. */

const ROLE_NAME: Record<string, string> = {
  supervisor: 'Supervisor',
  project_manager: 'Project manager',
  company_admin: 'Company admin',
  management: 'Management',
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
  return cell('person', { membershipId: rule.membershipId });
}

function ruleFromCell(c: Cell): CustomWorkflowInput['rows'][number]['cells'][number] {
  if (c.mode === 'skip' || c.mode === 'default') return null;
  if (c.mode === 'supervisor' || c.mode === 'project_managers') return { type: c.mode };
  if (c.mode === 'person') return c.membershipId ? { type: 'person', membershipId: c.membershipId } : null;
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
  const byRole = Object.keys(ROLE_NAME)
    .map((r) => ({ role: r, people: members.filter((m) => m.role === r) }))
    .filter((g) => g.people.length);
  return (
    <div className="o-cell">
      <select
        className="o-select"
        aria-label={`${label} approver`}
        value={modeValue}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v.startsWith('role:') ? cell('role', { role: v.slice(5) as CellRole }) : cell(v as Mode));
        }}
      >
        {!isDefault && <option value="default">Same as everyone else</option>}
        <option value="person">A specific person</option>
        <optgroup label="Linked to the employee">
          <option value="supervisor">Their supervisor</option>
          <option value="project_managers">Project's managers</option>
        </optgroup>
        <optgroup label="Anyone with a role">
          <option value="role:supervisor">Supervisor</option>
          <option value="role:project_manager">Project manager</option>
          <option value="role:company_admin">Company admin</option>
          <option value="role:management">Management (GM / CEO)</option>
        </optgroup>
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
      {value.mode === 'person' && (
        <select
          className="o-select"
          aria-label={`${label} person`}
          value={value.membershipId}
          onChange={(e) => onChange({ ...value, membershipId: e.target.value })}
          style={value.membershipId ? undefined : { borderColor: 'var(--warn)' }}
        >
          <option value="">Choose a person</option>
          {byRole.map((g) => (
            <optgroup key={g.role} label={ROLE_NAME[g.role]}>
              {g.people.map((m) => (
                <option key={m.membershipId} value={m.membershipId}>
                  {m.name}
                  {m.title ? ` (${m.title})` : ''}
                </option>
              ))}
            </optgroup>
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
    if (rows.some((r) => r.cells.some((c) => c.mode === 'person' && !c.membershipId))) {
      return toast('Choose the person in every "A specific person" cell.', 'bad');
    }
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
