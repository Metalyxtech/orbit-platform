'use client';
import { useState } from 'react';
import { Button, Chip, ConfirmDialog, DataTable, EmptyState } from '@orbit/ui';
import { cancelLeaveAction, decideLeaveAction, requestLeaveAction, saveLeaveTypeAction, saveRecordAction } from '../actions';
import { EMPLOYMENT_TYPES, LEAVE_STATUS } from '../config';
import type { DirectoryRow, LeaveRow } from '../server';
import { useRun } from './useRun';

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const span = (r: LeaveRow) => (r.halfDay ? `${fmt(r.from)} (half day)` : r.from === r.to ? fmt(r.from) : `${fmt(r.from)} to ${fmt(r.to)}`);
const statusChip = (s: string) => <Chip tone={LEAVE_STATUS[s]?.tone ?? 'grey'}>{LEAVE_STATUS[s]?.label ?? s}</Chip>;

type Balance = { id: string; code: string; name: string; paid: boolean; allowance: number; used: number; pending: number; left: number | null };

/** My HR: leave balances, ask for leave, my requests. */
export function MyLeaveClient({ balances, mine, today }: { balances: Balance[]; mine: LeaveRow[]; today: string }) {
  const { busy, run } = useRun();
  const [f, setF] = useState({ leaveTypeId: balances.find((b) => b.paid)?.id ?? balances[0]?.id ?? '', from: today, to: today, halfDay: false, reason: '' });
  return (
    <div className="o-stack">
      <div className="hr-balances">
        {balances.map((b) => (
          <div key={b.id} className="o-panel hr-balance">
            <span className="muted" style={{ fontSize: 12 }}>
              {b.name} ({b.code})
            </span>
            <strong>{b.paid ? b.left : '-'}</strong>
            <span className="faint" style={{ fontSize: 12 }}>
              {b.paid ? `left of ${b.allowance} · ${b.used} used${b.pending ? ` · ${b.pending} waiting` : ''}` : `unpaid · ${b.used} used`}
            </span>
          </div>
        ))}
      </div>
      <div className="o-cols">
        <div className="o-panel">
          <h2>Ask for leave</h2>
          <div className="o-grid2">
            <label className="o-field">
              Leave type
              <select className="o-select" value={f.leaveTypeId} onChange={(e) => setF({ ...f, leaveTypeId: e.target.value })}>
                {balances.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="o-field" style={{ alignSelf: 'end' }}>
              <span className="o-row" style={{ gap: 6 }}>
                <input type="checkbox" checked={f.halfDay} onChange={(e) => setF({ ...f, halfDay: e.target.checked, to: f.from })} />
                Half day
              </span>
            </label>
            <label className="o-field">
              From
              <input className="o-input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: f.to < e.target.value || f.halfDay ? e.target.value : f.to })} />
            </label>
            {!f.halfDay && (
              <label className="o-field">
                To
                <input className="o-input" type="date" min={f.from} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
              </label>
            )}
          </div>
          <label className="o-field">
            Reason
            <textarea className="o-textarea" maxLength={500} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          </label>
          <Button
            variant="primary"
            disabled={busy || !f.leaveTypeId || f.reason.trim().length < 3}
            onClick={async () => {
              const r = await run(() => requestLeaveAction({ ...f, to: f.halfDay ? f.from : f.to }));
              if (r) setF({ ...f, reason: '' });
            }}
          >
            Send request
          </Button>
          <p className="faint" style={{ fontSize: 12, margin: '8px 0 0' }}>
            Weekly off days and public holidays are not counted. Your supervisor or HR approves it; approved leave shows on your Timesheet week.
          </p>
        </div>
        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>My leave</h2>
          </div>
          <DataTable
            rows={mine}
            rowKey={(r) => r.id}
            empty={<EmptyState title="No leave yet." />}
            columns={[
              { key: 't', header: 'Type', render: (r) => r.type },
              { key: 'd', header: 'Dates', render: (r) => span(r) },
              { key: 'n', header: 'Days', num: true, render: (r) => r.days },
              { key: 's', header: 'Status', render: (r) => <span title={r.decisionNote ?? undefined}>{statusChip(r.status)}</span> },
              {
                key: 'x',
                header: '',
                render: (r) =>
                  (r.status === 'pending' || (r.status === 'approved' && r.from > today)) && (
                    <Button size="small" disabled={busy} onClick={() => void run(() => cancelLeaveAction({ id: r.id }), 'Leave cancelled.')}>
                      Cancel
                    </Button>
                  ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

/** Leave approvals: requests from the people I supervise (HR: everyone). */
export function LeaveQueueClient({ rows }: { rows: LeaveRow[] }) {
  const { busy, run } = useRun();
  const [pick, setPick] = useState<{ r: LeaveRow; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  return (
    <>
      <div className="o-panel flush">
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No leave requests waiting for you." />}
          columns={[
            { key: 'p', header: 'Person', render: (r) => <strong>{r.name}</strong> },
            { key: 't', header: 'Type', render: (r) => r.type },
            { key: 'd', header: 'Dates', render: (r) => span(r) },
            { key: 'n', header: 'Days', num: true, render: (r) => r.days },
            { key: 'r', header: 'Reason', render: (r) => r.reason },
            {
              key: 'a',
              header: '',
              render: (r) => (
                <div className="o-row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                  <Button size="small" variant="ok" disabled={busy} onClick={() => (setNote(''), setPick({ r, approve: true }))}>
                    Approve
                  </Button>
                  <Button size="small" disabled={busy} onClick={() => (setNote(''), setPick({ r, approve: false }))}>
                    Reject
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </div>
      <ConfirmDialog
        open={!!pick}
        title={pick ? `${pick.approve ? 'Approve' : 'Reject'} ${pick.r.days} days ${pick.r.type.toLowerCase()} for ${pick.r.name}?` : ''}
        confirmLabel={pick?.approve ? 'Approve' : 'Reject'}
        variant={pick?.approve ? 'ok' : 'danger'}
        onCancel={() => setPick(null)}
        onConfirm={() => {
          const p = pick;
          setPick(null);
          if (p) void run(() => decideLeaveAction({ id: p.r.id, approve: p.approve, note: note || undefined }), p.approve ? 'Approved. It shows on their Timesheet week.' : 'Rejected.');
        }}
      >
        <p style={{ marginTop: 0 }}>
          {pick && span(pick.r)}: {pick?.r.reason}
        </p>
        <label className="o-field">
          Note (optional)
          <input className="o-input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </ConfirmDialog>
    </>
  );
}

const blankRecord = (membershipId: string) => ({
  membershipId,
  employeeCode: '',
  department: '',
  designation: '',
  employmentType: 'permanent' as 'permanent' | 'contract' | 'trainee' | 'intern',
  joiningDate: '',
  dateOfBirth: '',
  phone: '',
  address: '',
  emergencyName: '',
  emergencyPhone: '',
  status: 'active' as 'active' | 'left',
  leftOn: '',
});

/** Employees: the directory, and HR edits a person's record. */
export function EmployeesClient({ rows, canEdit }: { rows: DirectoryRow[]; canEdit: boolean }) {
  const { busy, run } = useRun();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<ReturnType<typeof blankRecord> | null>(null);
  const shown = rows.filter((r) => !q || `${r.name} ${r.email} ${r.record?.department ?? ''} ${r.record?.designation ?? ''} ${r.record?.employeeCode ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const open = (r: DirectoryRow) => {
    const x = r.record;
    setEdit({
      ...blankRecord(r.membershipId),
      ...(x
        ? Object.fromEntries(Object.entries(x).filter(([k]) => k in blankRecord('')).map(([k, v]) => [k, v ?? '']))
        : { designation: r.title ?? '' }),
    } as ReturnType<typeof blankRecord>);
  };
  const field = (k: keyof ReturnType<typeof blankRecord>, label: string, type = 'text') => (
    <label className="o-field">
      {label}
      <input className="o-input" type={type} value={String(edit?.[k] ?? '')} onChange={(e) => edit && setEdit({ ...edit, [k]: e.target.value })} />
    </label>
  );
  const name = edit ? rows.find((r) => r.membershipId === edit.membershipId)?.name : '';
  return (
    <>
      <input className="o-input" style={{ maxWidth: 320 }} placeholder="Search name, department, code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search employees" />
      <div className="o-panel flush">
        <DataTable
          rows={shown}
          rowKey={(r) => r.membershipId}
          empty={<EmptyState title="No employees match." />}
          columns={[
            {
              key: 'n',
              header: 'Employee',
              render: (r) => (
                <>
                  <strong>{r.name}</strong>
                  <div className="faint" style={{ fontSize: 11 }}>
                    {r.record?.employeeCode ? `${r.record.employeeCode} · ` : ''}
                    {r.email}
                  </div>
                </>
              ),
            },
            { key: 'd', header: 'Department', render: (r) => r.record?.department ?? <span className="faint">-</span> },
            { key: 'g', header: 'Designation', render: (r) => r.record?.designation ?? r.title ?? <span className="faint">-</span> },
            { key: 't', header: 'Type', render: (r) => EMPLOYMENT_TYPES.find((t) => t.id === r.record?.employmentType)?.label ?? <span className="faint">-</span> },
            { key: 'j', header: 'Joined', render: (r) => (r.record?.joiningDate ? fmt(r.record.joiningDate) : <span className="faint">-</span>) },
            {
              key: 's',
              header: 'Record',
              render: (r) => (r.record ? <Chip tone={r.record.status === 'left' ? 'grey' : 'ok'}>{r.record.status === 'left' ? 'Left' : 'Complete'}</Chip> : <Chip tone="warn">Not filled</Chip>),
            },
            {
              key: 'e',
              header: '',
              render: (r) =>
                canEdit && (
                  <Button size="small" onClick={() => open(r)}>
                    {r.record ? 'Edit' : 'Fill in'}
                  </Button>
                ),
            },
          ]}
        />
      </div>
      <ConfirmDialog
        open={!!edit}
        title={`Employee record: ${name ?? ''}`}
        confirmLabel="Save record"
        confirmDisabled={busy}
        onCancel={() => setEdit(null)}
        onConfirm={async () => {
          if (!edit) return;
          const ok = await run(() => saveRecordAction(edit), 'Record saved.');
          if (ok) setEdit(null);
        }}
      >
        {edit && (
          <div className="o-grid2">
            {field('employeeCode', 'Employee code')}
            <label className="o-field">
              Employment type
              <select className="o-select" value={edit.employmentType} onChange={(e) => setEdit({ ...edit, employmentType: e.target.value as 'permanent' })}>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {field('department', 'Department')}
            {field('designation', 'Designation')}
            {field('joiningDate', 'Joining date', 'date')}
            {field('dateOfBirth', 'Date of birth', 'date')}
            {field('phone', 'Phone', 'tel')}
            {field('address', 'Address')}
            {field('emergencyName', 'Emergency contact')}
            {field('emergencyPhone', 'Emergency phone', 'tel')}
            <label className="o-field">
              Status
              <select className="o-select" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as 'active' })}>
                <option value="active">Working</option>
                <option value="left">Left the company</option>
              </select>
            </label>
            {edit.status === 'left' && field('leftOn', 'Last working day', 'date')}
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

type LeaveType = { id: string; code: string; name: string; daysPerYear: number; paid: boolean; active: boolean };

/** HR settings: leave types and days per year. */
export function LeaveTypesClient({ types }: { types: LeaveType[] }) {
  const { busy, run } = useRun();
  const blank = { id: undefined as string | undefined, code: '', name: '', daysPerYear: 12, paid: true, active: true };
  const [f, setF] = useState(blank);
  return (
    <div className="o-stack">
      <div className="o-panel flush">
        <DataTable
          rows={types}
          rowKey={(t) => t.id}
          columns={[
            { key: 'c', header: 'Code', render: (t) => <strong>{t.code}</strong> },
            { key: 'n', header: 'Leave type', render: (t) => <span className={t.active ? '' : 'faint'}>{t.name}</span> },
            { key: 'd', header: 'Days a year', num: true, render: (t) => (t.paid ? t.daysPerYear : '-') },
            { key: 'p', header: 'Paid', render: (t) => (t.paid ? 'Paid' : 'Unpaid') },
            { key: 'a', header: '', render: (t) => <Button size="small" onClick={() => setF({ ...t })}>Edit</Button> },
          ]}
        />
      </div>
      <div className="o-panel">
        <h2>{f.id ? `Edit ${f.code}` : 'Add a leave type'}</h2>
        <div className="o-grid2">
          <label className="o-field">
            Code
            <input className="o-input" maxLength={8} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="CL" />
          </label>
          <label className="o-field">
            Name
            <input className="o-input" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Casual leave" />
          </label>
          <label className="o-field">
            Days a year
            <input className="o-input" type="number" min={0} max={366} step={0.5} value={f.daysPerYear} onChange={(e) => setF({ ...f, daysPerYear: Number(e.target.value) || 0 })} />
          </label>
          <label className="o-field" style={{ alignSelf: 'end' }}>
            <span className="o-row" style={{ gap: 12 }}>
              <span className="o-row" style={{ gap: 6 }}>
                <input type="checkbox" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} /> Paid
              </span>
              <span className="o-row" style={{ gap: 6 }}>
                <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> In use
              </span>
            </span>
          </label>
        </div>
        <div className="o-row" style={{ gap: 8 }}>
          <Button
            variant="primary"
            disabled={busy || !f.code || f.name.trim().length < 2}
            onClick={async () => {
              const ok = await run(() => saveLeaveTypeAction(f), 'Leave type saved.');
              if (ok) setF(blank);
            }}
          >
            {f.id ? 'Save' : 'Add leave type'}
          </Button>
          {f.id && <Button onClick={() => setF(blank)}>Cancel</Button>}
        </div>
      </div>
    </div>
  );
}
