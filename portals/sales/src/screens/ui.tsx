import Link from 'next/link';
import type { ReactNode } from 'react';
import { Chip, DataTable, EmptyState } from '@orbit/ui';
import { fmtDate, fmtMoney, QUOTE_STATUS, stageTone, type QuoteStatus, type Stage } from '../config';
import type { EnquiryRow } from '../server';

/** Shared display helpers for the Sales screens (no client state). */

export const enquiryHref = (id: string) => `/sales/enquiry?id=${id}`;

export function StageChip({ stage, label }: { stage: Stage; label: string }) {
  return <Chip tone={stageTone(stage)}>{label}</Chip>;
}
export function QuoteChip({ status }: { status: QuoteStatus }) {
  const s = QUOTE_STATUS[status] ?? QUOTE_STATUS.draft;
  return <Chip tone={s.tone}>{s.label}</Chip>;
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

export function EnquiryTable({ rows, currency, empty, quotes = false }: { rows: EnquiryRow[]; currency: string; empty?: string; quotes?: boolean }) {
  return (
    <div className="o-scroll">
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState title={empty ?? 'No enquiries here.'} />}
        columns={[
          {
            key: 'n',
            header: quotes ? 'Quotation' : 'Enquiry',
            render: (r) => (
              <Link href={enquiryHref(r.id)}>
                <strong>{quotes ? `${r.quoteNo} Rev ${r.rev}` : r.number}</strong> {r.title}
                <div className="faint" style={{ fontSize: 11 }}>
                  {r.customer} · {r.owner || '-'}
                </div>
              </Link>
            ),
          },
          { key: 's', header: 'Stage', render: (r) => <StageChip stage={r.stage} label={r.stageLabel} /> },
          ...(quotes ? [{ key: 'q', header: 'Quotation', render: (r: EnquiryRow) => <QuoteChip status={r.quoteStatus} /> }] : []),
          { key: 'v', header: 'Value (before GST)', num: true, render: (r) => (r.net ? fmtMoney(currency, r.net) : <span className="faint">-</span>) },
          ...(quotes ? [{ key: 'd', header: 'Discount', num: true, render: (r: EnquiryRow) => (r.discount ? `${r.discount}%` : '-') }] : []),
          { key: 'p', header: 'Chance', num: true, render: (r) => `${r.probability}%` },
          {
            key: 'f',
            header: 'Follow-up',
            num: true,
            render: (r) => (
              <span>
                {fmtDate(r.followUp)} {r.late && <Chip tone="bad">Late</Chip>}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
