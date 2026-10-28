'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApprovalRoute, Button, ConfirmDialog, EmptyState, TopBar, useToast } from '@orbit/ui';
import { decideAction, decideBulkAction, taskDetailAction } from '../actions';
import { messages } from '../messages';
import type { InboxRow } from '../server/approvals';

type Detail = Extract<Awaited<ReturnType<typeof taskDetailAction>>, { ok: true }>['data'];

const ago = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return days === 0 ? `Today ${time}` : days === 1 ? `Yesterday ${time}` : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const due = (iso: string | null) => {
  if (!iso) return '';
  const h = Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000);
  return h >= 0 ? `in ${h} h` : `${-h} h overdue`;
};

export function ApprovalsClient({ rows }: { rows: InboxRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(rows[0]?.taskId ?? null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Detail | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!selected) return setDetail(null);
    let alive = true;
    taskDetailAction({ taskId: selected }).then((res) => alive && res.ok && setDetail(res.data));
    return () => {
      alive = false;
    };
  }, [selected]);

  const visible = rows.filter((r) => r.employee.toLowerCase().includes(search.toLowerCase()));
  const bulkable = visible.filter((r) => r.overtime === 0);
  const oldest = rows.reduce<string | null>((o, r) => (!o || (r.submittedAt && r.submittedAt < o) ? r.submittedAt : o), null);

  async function decide(action: 'approve' | 'return' | 'reject') {
    if (!detail) return;
    if (action !== 'approve' && !comment.trim()) return toast('Add a comment so the employee knows what to fix.', 'bad');
    setBusy(true);
    // The expected status makes a double click harmless: the second call gets a conflict.
    const res = await decideAction({ taskId: detail.taskId, action, comment: comment || undefined, expectedStatus: 'pending' });
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast(action === 'approve' ? `Approved ${detail.employee}, week ${detail.week}.` : action === 'return' ? 'Returned for correction.' : 'Rejected.');
    setComment('');
    const next = rows.find((r) => r.taskId !== detail.taskId);
    setSelected(next?.taskId ?? null);
    router.refresh();
  }

  async function bulk() {
    setConfirmBulk(false);
    setBusy(true);
    const res = await decideBulkAction({ taskIds: [...checked] });
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast(`Approved ${res.data.approved} timesheets.${res.data.skipped ? ` ${res.data.skipped} skipped.` : ''}`);
    setChecked(new Set());
    router.refresh();
  }

  return (
    <>
      <TopBar crumbs={['Timesheet', 'Approvals']}>
        <input className="o-input" style={{ width: 220 }} placeholder="Search team member" value={search} onChange={(e) => setSearch(e.target.value)} />
      </TopBar>
      <div className="o-page">
        <div className="o-cols-wide">
          <div className="o-stack">
            <div>
              <h1>Waiting for your approval</h1>
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                {rows.length} timesheets.{oldest ? ` Oldest was submitted ${Math.round((Date.now() - new Date(oldest).getTime()) / 3_600_000)} h ago.` : ''}
              </p>
            </div>
            <div className="o-panel flush" style={{ overflowX: 'auto' }}>
              {rows.length === 0 ? (
                <EmptyState title={messages.emptyApprovals} />
              ) : (
                <>
                  <div className="o-row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
                    <label className="o-toggle" style={{ fontSize: 12 }}>
                      <input
                        type="checkbox"
                        style={{ appearance: 'auto', width: 14, height: 14, background: 'none' }}
                        checked={bulkable.length > 0 && bulkable.every((r) => checked.has(r.taskId))}
                        onChange={(e) => setChecked(e.target.checked ? new Set(bulkable.map((r) => r.taskId)) : new Set())}
                      />
                      Select all without overtime
                    </label>
                    <span className="o-spacer" />
                    <Button variant="ok" size="small" disabled={checked.size === 0 || busy} onClick={() => setConfirmBulk(true)}>
                      Approve selected
                    </Button>
                  </div>
                  <table className="o-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32 }} />
                        <th>Employee</th>
                        <th className="num">Week</th>
                        <th className="num">Total</th>
                        <th className="num">Overtime</th>
                        <th>Submitted</th>
                        <th>Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => (
                        <tr key={r.taskId} className={selected === r.taskId ? 'selected' : undefined} onClick={() => setSelected(r.taskId)} style={{ cursor: 'pointer' }}>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${r.employee}`}
                              disabled={r.overtime > 0}
                              title={r.overtime > 0 ? 'Weeks with overtime are approved one by one' : undefined}
                              checked={checked.has(r.taskId)}
                              onChange={(e) => {
                                const next = new Set(checked);
                                if (e.target.checked) next.add(r.taskId);
                                else next.delete(r.taskId);
                                setChecked(next);
                              }}
                            />
                          </td>
                          <td>
                            <div className="o-row">
                              <span className="o-chip" style={{ borderRadius: '50%', width: 28, height: 28, display: 'grid', placeItems: 'center', padding: 0 }}>
                                {r.initials}
                              </span>
                              <div>
                                <div>{r.employee}</div>
                                <div className="faint" style={{ fontSize: 11 }}>{r.employeeTitle}</div>
                              </div>
                            </div>
                          </td>
                          <td className="num">{r.week}</td>
                          <td className="num">{r.total.toFixed(1)}</td>
                          <td className="num">{r.overtime > 0 ? <span className="o-chip hivis">{r.overtime.toFixed(1)} h</span> : <span className="faint">0.0</span>}</td>
                          <td>{r.resubmitted ? 'Returned, resubmitted' : ago(r.submittedAt)}</td>
                          <td>{r.overdue ? <span className="o-chip bad">{due(r.dueAt)}</span> : due(r.dueAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>

          {detail && (
            <div className="o-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 480 }}>
              <div className="o-row">
                <span className="o-chip" style={{ borderRadius: '50%', width: 32, height: 32, display: 'grid', placeItems: 'center', padding: 0 }}>
                  {detail.initials}
                </span>
                <div>
                  <strong>
                    {detail.employee}, week {detail.week}
                  </strong>
                  <div className="faint" style={{ fontSize: 11 }}>{detail.rangeLabel}</div>
                </div>
                <span className="o-spacer" />
                <span className="o-chip steel">{detail.stepLabel}</span>
              </div>
              <div>
                <div className="o-kv faint" style={{ fontSize: 11 }}>
                  <span>Project / cost code</span>
                  <span>Hours</span>
                </div>
                {detail.lines.map((l) => (
                  <div className="o-kv" key={l.label}>
                    <span>{l.label}</span>
                    <span>{l.hours.toFixed(1)}</span>
                  </div>
                ))}
                <div className="o-kv total">
                  <span>
                    Total <span className="muted">(overtime {detail.overtime.toFixed(1)})</span>
                  </span>
                  <span>{detail.total.toFixed(1)}</span>
                </div>
              </div>
              {detail.note && (
                <div className="o-banner">
                  <strong>Employee note:</strong> {detail.note}
                </div>
              )}
              {detail.warning && <div className="o-banner hivis">{detail.warning}</div>}
              {detail.route.length > 1 && (
                <ApprovalRoute
                  items={detail.route.map((s) => ({
                    name: s.name,
                    detail: s.step,
                    state: s.status === 'approved' ? 'done' : s.status === 'pending' ? 'current' : 'next',
                  }))}
                />
              )}
              <label className="o-field">
                Comment (required to return or reject)
                <textarea className="o-textarea" value={comment} onChange={(e) => setComment(e.target.value)} />
              </label>
              <div className="o-row" style={{ marginTop: 'auto' }}>
                <Button variant="danger" disabled={busy} onClick={() => decide('reject')}>
                  Reject
                </Button>
                <Button disabled={busy} onClick={() => decide('return')}>
                  Return for correction
                </Button>
                <span className="o-spacer" />
                <Button variant="ok" disabled={busy} onClick={() => decide('approve')}>
                  Approve
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog open={confirmBulk} title={`Approve ${checked.size} timesheets?`} confirmLabel="Approve" variant="ok" onConfirm={bulk} onCancel={() => setConfirmBulk(false)}>
        Only weeks without overtime can be approved together.
      </ConfirmDialog>
    </>
  );
}
