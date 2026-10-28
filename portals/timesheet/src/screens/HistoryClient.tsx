'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button, DataTable, EmptyState, StatusChip, TopBar, useToast } from '@orbit/ui';
import { requestCorrectionAction } from '../actions';
import type { HistoryRow } from '../server/week';

export function HistoryClient({ rows, timezone }: { rows: HistoryRow[]; timezone: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const locked = rows.filter((r) => r.status === 'locked');
  const [weekId, setWeekId] = useState(locked[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const returned = rows.find((r) => r.status === 'returned');

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    router.push(`?${p.toString()}`);
  };

  async function requestCorrection() {
    const res = await requestCorrectionAction({ timesheetId: weekId, reason });
    if (!res.ok) return toast(res.error, 'bad');
    setReason('');
    toast('Correction requested. Your company admin will reopen the week.');
  }

  return (
    <>
      <TopBar crumbs={['Timesheet', 'My history']}>
        <select className="o-select" style={{ width: 150 }} value={params.get('weeks') ?? '12'} onChange={(e) => setParam('weeks', e.target.value)} aria-label="Period">
          <option value="12">Last 12 weeks</option>
          <option value="26">Last 26 weeks</option>
          <option value="52">Last 52 weeks</option>
        </select>
        <select className="o-select" style={{ width: 150 }} value={params.get('status') ?? ''} onChange={(e) => setParam('status', e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="in_approval">In approval</option>
          <option value="returned">Returned</option>
          <option value="locked">Locked</option>
          <option value="rejected">Rejected</option>
        </select>
      </TopBar>
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>My history</h1>
            <p>Every week you have opened, with where it is now. Approved weeks are locked; ask for a correction if something is wrong.</p>
          </div>
        </div>
        <div className="o-panel flush" style={{ overflowX: 'auto' }}>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty={<EmptyState title="No weeks yet">Open My week to start.</EmptyState>}
            columns={[
              { key: 'w', header: 'Week', width: 60, render: (r) => <strong>{r.weekNumber}</strong> },
              { key: 'd', header: 'Dates', render: (r) => r.rangeLabel },
              { key: 't', header: 'Total', num: true, render: (r) => r.total.toFixed(1) },
              {
                key: 'o',
                header: 'Overtime',
                num: true,
                render: (r) => (r.overtime > 0 ? <span className="o-chip hivis">{r.overtime.toFixed(1)} h</span> : <span className="faint">0.0</span>),
              },
              { key: 's', header: 'Status', render: (r) => <StatusChip status={r.status} revision={r.revision || undefined} /> },
              { key: 'x', header: 'Where it is', render: (r) => <span className="muted">{r.whereItIs}</span> },
              {
                key: 'a',
                header: '',
                render: (r) => (
                  <Link
                    className={`o-btn small ${r.status === 'draft' || r.status === 'returned' ? 'primary' : ''}`}
                    href={`/timesheet?week=${r.weekStart}`}
                  >
                    {r.status === 'draft' ? 'Open' : r.status === 'returned' ? 'Correct' : 'View'}
                  </Link>
                ),
              },
            ]}
          />
        </div>

        <div className="o-cols" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {returned ? (
            <div className="o-panel">
              <h2>Week {returned.weekNumber} was returned to you</h2>
              <div className="o-banner">{returned.whereItIs}</div>
              <p className="muted" style={{ fontSize: 12 }}>
                Open the week, fix the row, and submit again. The approval starts again from step 1.
              </p>
            </div>
          ) : (
            <div />
          )}
          <div className="o-panel">
            <h2>Request a correction for a locked week</h2>
            <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
              Choose the week and say what is wrong. Your company admin reopens it as a new revision. The approved version stays on record.
            </p>
            {locked.length === 0 ? (
              <p className="faint">No locked weeks in this period.</p>
            ) : (
              <div className="o-stack" style={{ gap: 8 }}>
                <select className="o-select" value={weekId} onChange={(e) => setWeekId(e.target.value)} aria-label="Week">
                  {locked.map((r) => (
                    <option key={r.id} value={r.id}>
                      Week {r.weekNumber} ({r.rangeLabel})
                    </option>
                  ))}
                </select>
                <textarea className="o-textarea" placeholder="What is wrong?" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div>
                  <Button disabled={reason.trim().length < 3} onClick={requestCorrection}>
                    Request correction
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <p className="faint" style={{ fontSize: 11 }}>Times shown in {timezone}.</p>
      </div>
    </>
  );
}
