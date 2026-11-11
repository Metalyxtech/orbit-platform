import Link from 'next/link';
import type { ReactNode } from 'react';
import { Chip, DataTable, EmptyState } from '@orbit/ui';
import { fmtDate, QC_STATUS, SOURCES, type QcStatus } from '../config';
import type { QcRow } from '../server';

export const inspHref = (id: string) => `/quality/inspection?id=${id}`;

export function StatusChip({ status }: { status: QcStatus }) {
  const s = QC_STATUS[status] ?? QC_STATUS.pending;
  return <Chip tone={s.tone}>{s.label}</Chip>;
}
export function ResultChip({ result }: { result: 'pass' | 'fail' | null }) {
  if (!result) return null;
  return result === 'pass' ? <Chip tone="ok">PASS</Chip> : <Chip tone="bad">FAIL</Chip>;
}
export const SourceTag = ({ source }: { source: keyof typeof SOURCES }) => <Chip tone={source === 'purchase' ? 'steel' : 'grey'}>{source === 'purchase' ? 'Purchase' : 'Production'}</Chip>;

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

export function InspTable({ rows, empty, final = false }: { rows: QcRow[]; empty: string; final?: boolean }) {
  return (
    <div className="o-scroll">
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState title={empty} />}
        columns={[
          {
            key: 'n',
            header: 'Report',
            render: (r) => (
              <Link href={inspHref(r.id)}>
                <strong>{r.number}</strong> {r.title}
                <div className="faint" style={{ fontSize: 11 }}>
                  {r.sourceRef}
                  {r.party ? ` · ${r.party}` : ''}
                  {r.round > 1 ? ` · round ${r.round}` : ''}
                </div>
              </Link>
            ),
          },
          { key: 's', header: 'From', render: (r) => <SourceTag source={r.source} /> },
          { key: 'st', header: 'Status', render: (r) => <span className="o-row" style={{ gap: 4 }}><StatusChip status={r.status} /><ResultChip result={r.result} /></span> },
          ...(final
            ? [
                { key: 'i', header: 'Inspected by', render: (r: QcRow) => <span className="muted">{r.inspector || '-'}</span> },
                { key: 'a', header: 'Approved by', render: (r: QcRow) => <span className="muted">{r.approver || '-'}</span> },
                { key: 'd', header: 'Approved', num: true, render: (r: QcRow) => fmtDate(r.approvedAt) },
              ]
            : [
                { key: 'w', header: 'Waiting', num: true, render: (r: QcRow) => <span className={r.waitingHours > 24 ? 'bad' : 'muted'}>{r.waitingHours < 24 ? `${r.waitingHours} h` : `${Math.round(r.waitingHours / 24)} d`}</span> },
                { key: 'c', header: 'Raised', num: true, render: (r: QcRow) => fmtDate(r.createdAt) },
              ]),
        ]}
      />
    </div>
  );
}
