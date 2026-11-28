'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ConfirmDialog, DataTable, EmptyState, KpiStrip, TopBar, useToast } from '@orbit/ui';
import { cancelOtAction, decideOtAction, requestOtAction } from '../actions';
import type { OtReportRow } from '../server';
import type { TsKey } from '../i18n';
import { useTs } from './useTs';

type Req = { id: string; name: string; dateLabel: string; hours: number; project: string | null; reason: string; status: string; decisionNote: string | null };
type Report = { month: string; rates: { workday: number; offday: number }; rows: OtReportRow[]; totals: Omit<OtReportRow, 'membershipId' | 'name'> };

const STATUS: Record<string, TsKey> = { pending: 'otPending', approved: 'otApprovedStatus', rejected: 'otRejected', cancelled: 'otCancelled' };
const h = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/**
 * Timesheet > Overtime: ask for overtime before working it, see your requests; managers decide the
 * requests of their team and see the month's overtime, split and weighted for payroll.
 */
export function OvertimeClient({
  mine,
  queue,
  report,
  projects,
  today,
}: {
  mine: Req[];
  queue: Req[] | null;
  report: Report | null;
  projects: { id: string; code: string; name: string }[];
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTs();
  const [form, setForm] = useState({ date: today, hours: 2, projectId: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState<{ r: Req; approve: boolean } | null>(null);
  const [note, setNote] = useState('');

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast(done);
    router.refresh();
  }

  return (
    <>
      <TopBar crumbs={[t('timesheet'), t('overtime')]} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>{t('overtime')}</h1>
            <p>{t('otLead')}</p>
          </div>
        </div>

        {queue && (
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Waiting for you</h2>
            </div>
            <DataTable
              rows={queue}
              rowKey={(r) => r.id}
              empty={<EmptyState title="No overtime requests waiting." />}
              columns={[
                { key: 'n', header: 'Person', render: (r) => <strong>{r.name}</strong> },
                { key: 'd', header: 'Day', render: (r) => r.dateLabel },
                { key: 'h', header: 'Hours', num: true, render: (r) => h(r.hours) },
                { key: 'p', header: 'Project', render: (r) => r.project ?? <span className="faint">-</span> },
                { key: 'r', header: 'Reason', render: (r) => r.reason },
                {
                  key: 'a',
                  header: '',
                  render: (r) => (
                    <div className="o-row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <Button size="small" variant="ok" disabled={busy} onClick={() => (setNote(''), setDeciding({ r, approve: true }))}>
                        Approve
                      </Button>
                      <Button size="small" disabled={busy} onClick={() => (setNote(''), setDeciding({ r, approve: false }))}>
                        Reject
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}

        <div className="o-cols">
          <div className="o-panel">
            <h2>{t('askForOt')}</h2>
            <div className="o-grid2">
              <label className="o-field">
                {t('day')}
                <input className="o-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
              <label className="o-field">
                {t('hours')}
                <input className="o-input" type="number" min={0.25} max={16} step={0.25} value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) || 0 })} />
              </label>
              <label className="o-field">
                {t('projectOptional')}
                <select className="o-select" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                  <option value="">{t('noProject')}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="o-field">
              {t('whyNeeded')}
              <textarea className="o-textarea" maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={t('whyPlaceholder')} />
            </label>
            <Button
              variant="primary"
              disabled={busy || form.reason.trim().length < 3 || form.hours <= 0}
              onClick={() =>
                void run(async () => {
                  const res = await requestOtAction({ date: form.date, hours: form.hours, projectId: form.projectId || null, reason: form.reason });
                  if (res.ok) setForm({ ...form, reason: '' });
                  return res;
                }, t('otSent'))
              }
            >
              {t('sendRequest')}
            </Button>
          </div>

          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>{t('myRequests')}</h2>
            </div>
            <DataTable
              rows={mine}
              rowKey={(r) => r.id}
              empty={<EmptyState title={t('noRequests')} />}
              columns={[
                { key: 'd', header: t('day'), render: (r) => r.dateLabel },
                { key: 'h', header: t('hours'), num: true, render: (r) => h(r.hours) },
                {
                  key: 's',
                  header: t('status'),
                  render: (r) => (
                    <span title={r.decisionNote ?? undefined} className={`o-chip ${r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'bad' : r.status === 'pending' ? 'warn' : ''}`}>
                      {STATUS[r.status] ? t(STATUS[r.status]) : r.status}
                    </span>
                  ),
                },
                {
                  key: 'x',
                  header: '',
                  render: (r) =>
                    r.status === 'pending' ? (
                      <Button size="small" disabled={busy} onClick={() => void run(() => cancelOtAction({ id: r.id }), t('requestCancelled'))}>
                        {t('cancel')}
                      </Button>
                    ) : null,
                },
              ]}
            />
          </div>
        </div>

        {report && (
          <div className="o-stack">
            <div className="o-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>Overtime for payroll, {new Date(`${report.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2>
              <form className="o-row" style={{ gap: 6 }}>
                <input className="o-input" type="month" name="month" defaultValue={report.month} aria-label="Month" />
                <button className="o-btn small" type="submit">
                  Show
                </button>
              </form>
            </div>
            <KpiStrip
              items={[
                { value: h(report.totals.overtime), label: 'Overtime hours' },
                { value: h(report.totals.offdayOt), label: 'On days off and holidays' },
                { value: h(report.totals.notPreApprovedOt), label: 'Not approved in advance', tone: report.totals.notPreApprovedOt ? 'hivis' : undefined },
                { value: h(report.totals.weighted), label: `Payroll hours (×${report.rates.workday} / ×${report.rates.offday})` },
              ]}
            />
            <div className="o-panel flush">
              <DataTable
                rows={report.rows}
                rowKey={(r) => r.membershipId}
                empty={<EmptyState title="No overtime in submitted or approved weeks this month." />}
                columns={[
                  { key: 'n', header: 'Person', render: (r) => r.name },
                  { key: 'o', header: 'Overtime', num: true, render: (r) => h(r.overtime) },
                  { key: 'w', header: `Working days ×${report.rates.workday}`, num: true, render: (r) => h(r.workdayOt) },
                  { key: 'f', header: `Days off ×${report.rates.offday}`, num: true, render: (r) => h(r.offdayOt) },
                  { key: 'p', header: 'Pre-approved', num: true, render: (r) => h(r.preApprovedOt) },
                  { key: 'u', header: 'Not approved', num: true, render: (r) => (r.notPreApprovedOt ? <span className="hivis">{h(r.notPreApprovedOt)}</span> : '0.0') },
                  { key: 'g', header: 'Payroll hours', num: true, render: (r) => <strong>{h(r.weighted)}</strong> },
                ]}
              />
            </div>
            <p className="faint" style={{ fontSize: 12, margin: 0 }}>
              Weeks that start in this month and are submitted or approved. Rates are set in <Link href="/timesheet/admin/roster">Shifts and holidays</Link>.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deciding}
        title={deciding ? `${deciding.approve ? 'Approve' : 'Reject'} ${h(deciding.r.hours)} h for ${deciding.r.name}, ${deciding.r.dateLabel}?` : ''}
        confirmLabel={deciding?.approve ? 'Approve' : 'Reject'}
        variant={deciding?.approve ? 'ok' : 'danger'}
        onCancel={() => setDeciding(null)}
        onConfirm={() => {
          const d = deciding;
          setDeciding(null);
          if (d) void run(() => decideOtAction({ id: d.r.id, approve: d.approve, note: note || undefined }), d.approve ? 'Approved: it shows as pre-approved on their timesheet.' : 'Rejected.');
        }}
      >
        <p style={{ marginTop: 0 }}>{deciding?.r.reason}</p>
        <label className="o-field">
          Note to {deciding?.r.name} (optional)
          <input className="o-input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </ConfirmDialog>
    </>
  );
}
