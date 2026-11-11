import Link from 'next/link';
import type { ReactNode } from 'react';
import { Chip, DataTable, EmptyState } from '@orbit/ui';
import { fmtDate, fmtQty, PRIORITIES, WO_STATUS, type WoStatus } from '../config';
import type { WoRow } from '../server';

/** Shared display helpers for the Production screens (no client state). */

export const woHref = (id: string) => `/production/order?id=${id}`;
export const mrHref = (id: string) => `/production/mr?id=${id}`;

export function StatusChip({ status }: { status: WoStatus }) {
  const s = WO_STATUS[status] ?? WO_STATUS.draft;
  return <Chip tone={s.tone}>{s.label}</Chip>;
}
export function PriorityChip({ priority }: { priority: string }) {
  const p = PRIORITIES.find((x) => x.id === priority);
  if (!p || p.id === 'normal') return null;
  return <Chip tone={p.tone}>{p.label}</Chip>;
}

export function Progress({ value, tone }: { value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--hivis, #d97706)' : value >= 100 ? 'var(--ok)' : 'var(--steel)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 8, background: 'var(--line-2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color }} />
      </div>
      <span style={{ fontSize: 11, minWidth: 32, textAlign: 'right' }} className="muted">
        {value}%
      </span>
    </div>
  );
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

export function NotReady({ message }: { message: string }) {
  return (
    <div className="o-page">
      <EmptyState title={message}>Ask the person who runs Orbit for your company to run the database update.</EmptyState>
    </div>
  );
}

export function WoTable({ rows, empty }: { rows: WoRow[]; empty?: string }) {
  return (
    <div className="o-scroll">
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState title={empty ?? 'No work orders here.'} />}
        columns={[
          {
            key: 'n',
            header: 'Work order',
            render: (r) => (
              <Link href={woHref(r.id)}>
                <strong>{r.number}</strong> {r.title}
                <div className="faint" style={{ fontSize: 11 }}>
                  {r.trade}
                  {r.customer ? ` · ${r.customer}` : ''}
                </div>
              </Link>
            ),
          },
          { key: 's', header: 'Status', render: (r) => <span className="o-row" style={{ gap: 4, flexWrap: 'wrap' }}><StatusChip status={r.status} /><PriorityChip priority={r.priority} />{r.rework && <Chip tone="bad">QC failed: rework</Chip>}</span> },
          { key: 'q', header: 'Quantity', num: true, render: (r) => `${fmtQty(r.qty)} ${r.unit}` },
          { key: 'p', header: 'Progress', render: (r) => <Progress value={r.progress} tone={r.rework ? 'bad' : undefined} /> },
          { key: 'o', header: 'Operations', num: true, render: (r) => `${r.opsDone} / ${r.opsTotal}` },
          { key: 'd', header: 'Due', num: true, render: (r) => <span>{fmtDate(r.due)} {r.late && <Chip tone="bad">Late</Chip>}</span> },
        ]}
      />
    </div>
  );
}
