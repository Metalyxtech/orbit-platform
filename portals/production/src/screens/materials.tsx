import Link from 'next/link';
import type { ReactNode } from 'react';
import { query } from '@orbit/core/next';
import { qualityOn } from '@orbit/core/quality';
import { addProcessCommentAction, setHoldAction } from '@orbit/core/holds-actions';
import { Chip, DataTable, EmptyState, HoldBanner, ProcessControl, TopBar } from '@orbit/ui';
import { fmtDate, fmtQty, MR_FLOW, MR_STATUS, RECEIPT_STATUS } from '../config';
import { mr, myRole, receipts, stock, type MrFilter } from '../server';
import { MrActions, MrChip, ReceiveDirectForm, StockAdjustForm, StoreDocsUpload } from './MaterialsClient';
import { mrHref, PageHead, woHref } from './ui';

// Production store screens: material requests, one request, production stock and material received.

type SearchParams = Record<string, string | string[] | undefined>;
type Screen = (props: { searchParams: SearchParams }) => Promise<ReactNode>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

const FILTERS: { id: MrFilter; label: string }[] = [
  { id: 'action', label: 'Waiting for me' },
  { id: 'open', label: 'Open' },
  { id: 'all', label: 'All' },
];

export const Materials: Screen = async ({ searchParams }) => {
  const filter = (FILTERS.find((f) => f.id === one(searchParams.f))?.id ?? 'open') as MrFilter;
  const rows = await query((tx, ctx) => mr.listMrs(tx, ctx, { filter }));
  return (
    <>
      <TopBar crumbs={['Production', 'Material requests']} />
      <div className="o-page">
        <PageHead
          title="Material requests"
          lead="Supervisor asks → production store issues from its stock, or asks for the balance → production engineer → production manager → Purchase (main store or buying) → material arrives → issued to the work order."
        />
        <div className="o-row" style={{ gap: 6 }}>
          {FILTERS.map((f) => (
            <Link key={f.id} className={`o-btn small${f.id === filter ? ' primary' : ''}`} href={`/production/materials?f=${f.id}`}>
              {f.label}
            </Link>
          ))}
        </div>
        <div className="o-panel flush">
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty={<EmptyState title={filter === 'action' ? 'Nothing waiting for you.' : 'No material requests yet. A supervisor raises one from a released work order.'} />}
            columns={[
              { key: 'n', header: 'Request', render: (r) => <Link href={mrHref(r.id)}><strong>{r.number}</strong></Link> },
              { key: 'w', header: 'Work order', render: (r) => <Link href={woHref(r.workOrderId)}>{r.wo} <span className="muted">{r.woTitle}</span></Link> },
              { key: 'i', header: 'Items', render: (r) => <span style={{ fontSize: 12 }}>{r.items}</span> },
              { key: 's', header: 'Status', render: (r) => <><MrChip status={r.status} />{r.purchaseRef && <div className="faint" style={{ fontSize: 11 }}>Purchase {r.purchaseRef}</div>}</> },
              { key: 'b', header: 'Asked by', render: (r) => r.by },
              { key: 'd', header: 'Days', num: true, render: (r) => r.days },
            ]}
          />
        </div>
      </div>
    </>
  );
};

export const MrPage: Screen = async ({ searchParams }) => {
  const id = one(searchParams.id) ?? '';
  const d = isId(id) ? await query((tx, ctx) => mr.mrDetail(tx, ctx, id)) : null;
  if (!d)
    return (
      <div className="o-page">
        <EmptyState title="Material request not found" />
      </div>
    );
  const at = MR_FLOW.indexOf(d.mr.status as (typeof MR_FLOW)[number]);
  const closed = ['issued', 'rejected', 'cancelled'].includes(d.mr.status);
  return (
    <>
      <TopBar crumbs={['Production', 'Material requests', d.mr.number]} />
      <div className="o-page">
        <PageHead
          title={`${d.mr.number}: material for ${d.wo.number}`}
          lead={
            <>
              <Link href={woHref(d.wo.id)}>{d.wo.title}</Link> · asked by {d.mr.by} on {fmtDate(d.mr.at)}
            </>
          }
        >
          <MrChip status={d.mr.status} />
        </PageHead>
        <ol className="p-track">
          {MR_FLOW.map((s, i) => (
            <li key={s} className={d.mr.status === 'issued' || (at >= 0 && i < at) ? 'done' : i === at ? 'now' : ''}>
              {s === 'store' ? 'Production store' : s === 'issued' ? 'Issued' : MR_STATUS[s].label}
            </li>
          ))}
        </ol>
        <HoldBanner thread={d.control} />
        {d.mr.returnNote && !closed && (
          <div className="o-panel" style={{ borderLeft: '4px solid var(--hivis, #d97706)' }}>
            <strong>Sent back</strong>
            <p style={{ margin: '6px 0 0' }}>“{d.mr.returnNote}”</p>
          </div>
        )}
        <div className="o-cols">
          <div className="o-stack">
            <div className="o-panel flush">
              <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                <h2>Items</h2>
              </div>
              <table className="o-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="num">Asked</th>
                    <th className="num">Issued</th>
                    <th className="num">In production store</th>
                    <th className="num">From Purchase</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.item}</td>
                      <td className="num">
                        {fmtQty(l.qty)} {l.unit}
                      </td>
                      <td className="num">{fmtQty(l.issued)}</td>
                      <td className="num">{l.left > 0 ? <Chip tone={l.available >= l.left - 1e-9 ? 'ok' : 'warn'}>{fmtQty(l.available)}</Chip> : '-'}</td>
                      <td className="num">{l.toBuy > 0 ? `${fmtQty(l.received)} / ${fmtQty(l.toBuy)}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.mr.note && (
              <div className="o-panel">
                <h2>Note</h2>
                <p style={{ margin: 0 }}>{d.mr.note}</p>
              </div>
            )}
            {d.receipts.length > 0 && (
              <div className="o-panel">
                <h2>Deliveries</h2>
                {d.receipts.map((r) => (
                  <div key={r.id} className="o-row" style={{ gap: 8, justifyContent: 'space-between' }}>
                    <span>
                      <strong>{r.number}</strong> · {r.reference} · {fmtDate(r.at)}
                    </span>
                    <span className="o-row" style={{ gap: 6 }}>
                      <Chip tone={RECEIPT_STATUS[r.status].tone}>{RECEIPT_STATUS[r.status].label}</Chip>
                      {d.can.docs && <StoreDocsUpload receiptId={r.id} label="Add MTC" />}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="o-stack">
            <div className="o-panel p-action">
              <h2>{closed ? MR_STATUS[d.mr.status].label : `Now: ${MR_STATUS[d.mr.status].label}`}</h2>
              <MrActions d={d} />
            </div>
            <ProcessControl thread={d.control} setHold={setHoldAction} comment={addProcessCommentAction} />
            <div className="o-panel">
              <h2>Approvals</h2>
              <div className="p-dl">
                <div>
                  <span>Production engineer</span>
                  <strong>{d.mr.engineer ? `${d.mr.engineer.name}, ${fmtDate(d.mr.engineer.at)}` : '-'}</strong>
                </div>
                <div>
                  <span>Production manager</span>
                  <strong>{d.mr.manager ? `${d.mr.manager.name}, ${fmtDate(d.mr.manager.at)}` : '-'}</strong>
                </div>
                <div>
                  <span>Purchase</span>
                  <strong>
                    {d.purchase ? `${d.purchase.number}: ${d.purchase.stageLabel}${d.purchase.poNo ? ` (PO ${d.purchase.poNo})` : ''}` : d.mr.purchaseRef ?? (d.purchaseUsed ? '-' : 'Purchase portal not used')}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export const Stock: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ ...(await stock.stockList(tx, ctx)), me: await myRole(tx, ctx) }));
  const store = ['store', 'manager', 'admin'].includes(d.me);
  return (
    <>
      <TopBar crumbs={['Production', 'Production store', 'Stock']} />
      <div className="o-page">
        <PageHead title="Production store stock" lead="What is in the shop-floor store. Material comes in from the main store, from purchases and direct receipts (after QC); it goes out to work orders." />
        {store && <StockAdjustForm />}
        <div className="o-panel flush">
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            empty={<EmptyState title="The production store is empty. Record material received, or add opening stock." />}
            columns={[
              { key: 'n', header: 'Item', render: (r) => <strong>{r.name}</strong> },
              { key: 'q', header: 'On hand', num: true, render: (r) => <Chip tone={r.onHand > 0 ? 'ok' : 'grey'}>{`${fmtQty(r.onHand)} ${r.unit}`}</Chip> },
              { key: 'l', header: 'Location', render: (r) => r.location ?? '-' },
            ]}
          />
        </div>
        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>Recent movements</h2>
          </div>
          <DataTable
            rows={d.moves}
            rowKey={(r) => r.id}
            empty={<EmptyState title="No movements yet." />}
            columns={[
              { key: 'a', header: 'Date', render: (r) => fmtDate(r.at) },
              { key: 'i', header: 'Item', render: (r) => r.item },
              { key: 't', header: 'Type', render: (r) => <Chip tone={r.type === 'IN' ? 'ok' : r.type === 'OUT' ? 'steel' : 'warn'}>{r.type === 'IN' ? 'In' : r.type === 'OUT' ? 'Issued' : 'Adjusted'}</Chip> },
              { key: 'q', header: 'Qty', num: true, render: (r) => `${r.qty > 0 ? '+' : ''}${fmtQty(r.qty)} ${r.unit}` },
              { key: 'b', header: 'Balance', num: true, render: (r) => fmtQty(r.balanceAfter) },
              { key: 'r', header: 'Reference', render: (r) => <span style={{ fontSize: 12 }}>{[r.reference, r.note].filter(Boolean).join(' · ')}</span> },
            ]}
          />
        </div>
      </div>
    </>
  );
};

export const Receipts: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ rows: await receipts.listReceipts(tx, ctx), me: await myRole(tx, ctx), qc: await qualityOn(tx, ctx.companyId) }));
  const store = ['store', 'manager', 'admin'].includes(d.me);
  return (
    <>
      <TopBar crumbs={['Production', 'Production store', 'Material received']} />
      <div className="o-page">
        <PageHead
          title="Material received"
          lead={`Everything that arrives at the shop floor, with its MTC / test certificates.${d.qc ? ' QC inspects each receipt before it goes into the production store stock.' : ''}`}
        >
          {store && <ReceiveDirectForm qc={d.qc} />}
        </PageHead>
        <div className="o-panel flush">
          <DataTable
            rows={d.rows}
            rowKey={(r) => r.id}
            empty={<EmptyState title="Nothing received yet." />}
            columns={[
              { key: 'n', header: 'Receipt', render: (r) => <><strong>{r.number}</strong><div className="faint" style={{ fontSize: 11 }}>{fmtDate(r.at)} · {r.by}</div></> },
              { key: 'r', header: 'Delivery note', render: (r) => <>{r.reference}{r.supplier && <div className="faint" style={{ fontSize: 11 }}>{r.supplier}</div>}{r.fromPurchase && <div className="faint" style={{ fontSize: 11 }}>Bought by Purchase</div>}</> },
              { key: 'i', header: 'Items', render: (r) => <span style={{ fontSize: 12 }}>{r.items}</span> },
              { key: 's', header: 'Status', render: (r) => <Chip tone={RECEIPT_STATUS[r.status].tone}>{RECEIPT_STATUS[r.status].label}</Chip> },
              {
                key: 'f',
                header: 'MTC / documents',
                render: (r) => (
                  <div className="o-stack" style={{ gap: 2, fontSize: 12 }}>
                    {r.files.map((f) => (
                      <a key={f.id} href={`/api/production-receipt-files/${f.id}`} target="_blank" rel="noreferrer">
                        {f.name}
                      </a>
                    ))}
                    {store && <StoreDocsUpload receiptId={r.id} label={r.files.length ? 'Add more' : 'Upload MTC'} />}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
    </>
  );
};
