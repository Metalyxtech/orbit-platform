import Link from 'next/link';
import type { ReactNode } from 'react';
import { Chip, DataTable, EmptyState } from '@orbit/ui';
import { stageTone, type Stage } from '../config';
import type { RequestRow } from '../server';

/** Shared display helpers for the Purchase screens (no client state). */
export const fmtMoney = (cur: string, v: number) =>
  `${cur}${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: v % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const fmtK = (cur: string, v: number) => `${cur}${v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `${(v / 1e3).toFixed(1)}K` : Math.round(v).toLocaleString('en-US')}`;
export const fmtQty = (v: number) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
export const fmtDate = (d: string | null) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-';

export function StageChip({ stage, label }: { stage: Stage; label: string }) {
  return <Chip tone={stageTone(stage)}>{label}</Chip>;
}

export function PageHead({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <div className="o-page-head">
      <div>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {children && <div className="o-row">{children}</div>}
    </div>
  );
}

/** Pipeline strip: one box per stage with the number of open requests. */
export function Pipeline({ stages, currency }: { stages: { stage: Stage; label: string; count: number; value: number }[]; currency: string }) {
  return (
    <div className="p-pipe">
      {stages.map((s) => (
        <Link key={s.stage} href={`/procurement/requests?stage=${s.stage}`} className={`p-pipe-step${s.count ? ' on' : ''}`}>
          <span className="p-pipe-n">{s.count}</span>
          <span className="p-pipe-l">{s.label}</span>
          <span className="p-pipe-v">{s.count ? fmtK(currency, s.value) : ''}</span>
        </Link>
      ))}
    </div>
  );
}

export function RequestTable({ rows, currency, empty, showOwner = true }: { rows: RequestRow[]; currency: string; empty?: string; showOwner?: boolean }) {
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      empty={<EmptyState title={empty ?? 'No requests here.'} />}
      columns={[
        {
          key: 'n',
          header: 'Request',
          render: (r) => (
            <Link href={`/procurement/request?id=${r.id}`}>
              <strong>{r.number}</strong> {r.title}
              <div className="faint" style={{ fontSize: 11 }}>
                {r.project} · {r.requester}
              </div>
            </Link>
          ),
        },
        { key: 's', header: 'Stage', render: (r) => <StageChip stage={r.stage} label={r.stageLabel} /> },
        ...(showOwner
          ? [{ key: 'o', header: 'Waiting on', render: (r: RequestRow) => (r.owner ? <span className={r.actionable ? 'hivis' : 'muted'}>{r.actionable ? 'You' : r.owner}</span> : <span className="faint">-</span>) }]
          : []),
        { key: 'v', header: 'Value', num: true, render: (r) => fmtMoney(currency, r.value) },
        {
          key: 'd',
          header: 'Need by',
          num: true,
          render: (r) => (
            <span>
              {fmtDate(r.needBy)} {r.late && <Chip tone="bad">Late</Chip>} {r.priority === 'Urgent' && <Chip tone="warn">Urgent</Chip>}
            </span>
          ),
        },
        { key: 'a', header: 'In stage', num: true, render: (r) => (r.stage === 'closed' || r.stage === 'rejected' ? '-' : `${r.daysInStage} d`) },
      ]}
    />
  );
}

export function NotReady({ message }: { message: string }) {
  return (
    <div className="o-page">
      <EmptyState title={message}>Ask the person who runs Orbit for your company to run the database update.</EmptyState>
    </div>
  );
}
