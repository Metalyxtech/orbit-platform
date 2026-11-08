'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Chip, DataTable, EmptyState } from '@orbit/ui';
import { fmtDate, fmtMoney, roleLabel, SALES_ROLES, type SalesConfig } from '../config';
import {
  addCustomerAction,
  advanceOrderAction,
  confirmOrderAction,
  raiseInvoiceAction,
  recordPaymentAction,
  saveSettingsAction,
  setSalesRoleAction,
  setTargetsAction,
} from '../actions';
import type { CustomerRow, InvoiceRow, OrderRow, SalesPerson } from '../server';
import { enquiryHref } from './ui';
import { useRun } from './useRun';

// Client parts of the list pages: orders, invoices, customers, targets and settings.

export function OrdersTable({ rows, currency, can }: { rows: OrderRow[]; currency: string; can: { confirm: boolean; advance: boolean; invoice: boolean } }) {
  const { busy, run } = useRun();
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      empty={<EmptyState title="No sales orders yet. They appear when an enquiry is won." />}
      columns={[
        { key: 'n', header: 'Order', render: (r) => <>{r.enquiryId ? <Link href={enquiryHref(r.enquiryId)}><strong>{r.number}</strong></Link> : <strong>{r.number}</strong>} {r.title}<div className="faint" style={{ fontSize: 11 }}>{r.customer} · {r.owner || '-'}</div></> },
        { key: 'd', header: 'Date', render: (r) => fmtDate(r.createdAt) },
        { key: 'v', header: 'Value (before GST)', num: true, render: (r) => fmtMoney(currency, r.value) },
        { key: 'a', header: 'Advance', num: true, render: (r) => `${r.advancePct}%` },
        { key: 's', header: 'Status', render: (r) => <Chip tone={r.status === 'awaiting' ? 'hivis' : r.status === 'invoiced' ? 'ok' : 'steel'}>{r.statusLabel}</Chip> },
        {
          key: 'x',
          header: '',
          render: (r) => (
            <span className="o-row" style={{ gap: 6 }}>
              {can.confirm && r.status === 'awaiting' && <Button size="small" variant="ok" disabled={busy} onClick={() => run(() => confirmOrderAction({ id: r.id }), 'Order confirmed.')}>Confirm</Button>}
              {can.advance && r.status === 'confirmed' && <Button size="small" disabled={busy} onClick={() => run(() => advanceOrderAction({ id: r.id }), 'In production.')}>Start production</Button>}
              {can.advance && r.status === 'production' && <Button size="small" disabled={busy} onClick={() => run(() => advanceOrderAction({ id: r.id }), 'Dispatched.')}>Dispatched</Button>}
              {can.invoice && ['confirmed', 'production', 'dispatched'].includes(r.status) && <Button size="small" variant="primary" disabled={busy} onClick={() => run(() => raiseInvoiceAction({ id: r.id }), 'Invoice raised.')}>Raise invoice</Button>}
            </span>
          ),
        },
      ]}
    />
  );
}

export function InvoicesTable({ rows, currency, canRecord }: { rows: InvoiceRow[]; currency: string; canRecord: boolean }) {
  const { busy, run } = useRun();
  const [pay, setPay] = useState<{ id: string; amount: string; reference: string } | null>(null);
  return (
    <>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState title="No invoices yet." />}
        columns={[
          { key: 'n', header: 'Invoice', render: (r) => <><strong>{r.number}</strong><div className="faint" style={{ fontSize: 11 }}>{r.customer}{r.order ? ` · ${r.order}` : ''}</div></> },
          { key: 'i', header: 'Issued', render: (r) => fmtDate(r.issued) },
          { key: 'd', header: 'Due', render: (r) => <>{fmtDate(r.due)} {r.overdueDays > 0 && <Chip tone="bad">{r.overdueDays} d late</Chip>}</> },
          { key: 'a', header: 'Amount', num: true, render: (r) => fmtMoney(currency, r.amount) },
          { key: 'p', header: 'Received', num: true, render: (r) => fmtMoney(currency, r.paid) },
          { key: 'b', header: 'Balance', num: true, render: (r) => (r.balance > 0.5 ? <strong>{fmtMoney(currency, r.balance)}</strong> : <Chip tone="ok">Paid</Chip>) },
          ...(canRecord ? [{ key: 'x', header: '', render: (r: InvoiceRow) => (r.balance > 0.5 ? <Button size="small" onClick={() => setPay({ id: r.id, amount: String(Math.round(r.balance * 100) / 100), reference: '' })}>Record payment</Button> : null) }] : []),
        ]}
      />
      {pay && (
        <div className="o-row" style={{ padding: 12, borderTop: '1px solid var(--line)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="o-field">
            Amount received
            <input className="o-input" type="number" min={0} step="any" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
          </label>
          <label className="o-field" style={{ flex: 1 }}>
            Reference (UTR, cheque no.)
            <input className="o-input" value={pay.reference} maxLength={120} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
          </label>
          <Button variant="primary" disabled={busy} onClick={async () => (await run(() => recordPaymentAction({ id: pay.id, amount: Number(pay.amount) || 0, reference: pay.reference }), 'Payment recorded.')) && setPay(null)}>Save</Button>
          <Button onClick={() => setPay(null)}>Cancel</Button>
        </div>
      )}
    </>
  );
}

export function CustomersClient({ rows, currency, canAdd }: { rows: CustomerRow[]; currency: string; canAdd: boolean }) {
  const { busy, run } = useRun();
  const blank = { name: '', city: '', contact: '', phone: '', email: '', gstin: '', terms: '' };
  const [f, setF] = useState<typeof blank | null>(null);
  return (
    <>
      {canAdd && !f && (
        <div>
          <Button variant="primary" onClick={() => setF(blank)}>Add customer</Button>
        </div>
      )}
      {f && (
        <div className="o-panel">
          <h2>New customer</h2>
          <div className="o-form-row">
            {(Object.keys(blank) as (keyof typeof blank)[]).map((k) => (
              <label key={k} className="o-field">
                {{ name: 'Company name', city: 'City', contact: 'Contact person', phone: 'Phone', email: 'Email', gstin: 'GSTIN', terms: 'Payment terms' }[k]}
                <input className="o-input" value={f[k]} maxLength={160} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="o-row" style={{ marginTop: 10 }}>
            <Button variant="primary" disabled={busy} onClick={async () => (await run(() => addCustomerAction(f), 'Customer added.')) && setF(null)}>Save customer</Button>
            <Button onClick={() => setF(null)}>Cancel</Button>
          </div>
        </div>
      )}
      <div className="o-panel flush">
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No customers yet." />}
          columns={[
            { key: 'n', header: 'Customer', render: (r) => <><strong>{r.name}</strong><div className="faint" style={{ fontSize: 11 }}>{r.city || '-'}{r.gstin ? ` · ${r.gstin}` : ''}</div></> },
            { key: 'c', header: 'Contact', render: (r) => <>{r.contact || '-'}<div className="faint" style={{ fontSize: 11 }}>{[r.phone, r.email].filter(Boolean).join(' · ')}</div></> },
            { key: 't', header: 'Terms', render: (r) => r.terms || '-' },
            { key: 'o', header: 'Open enquiries', num: true, render: (r) => r.openEnquiries },
            { key: 'b', header: 'Outstanding', num: true, render: (r) => (r.outstanding > 0.5 ? fmtMoney(currency, r.outstanding) : '-') },
          ]}
        />
      </div>
    </>
  );
}

export function TargetsClient({ rows, people, currency, canEdit }: { rows: { membershipId: string; name: string; target: number; won: number; open: number }[]; people: { id: string; name: string }[]; currency: string; canEdit: boolean }) {
  const { busy, run } = useRun();
  const [t, setT] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.membershipId, String(r.target || '')])));
  const [add, setAdd] = useState('');
  const shown = [...rows, ...people.filter((p) => t[p.id] !== undefined && !rows.some((r) => r.membershipId === p.id)).map((p) => ({ membershipId: p.id, name: p.name, target: 0, won: 0, open: 0 }))];
  return (
    <div className="o-panel flush">
      <table className="o-table">
        <thead>
          <tr><th>Salesperson</th><th className="num">Open enquiries</th><th className="num">Orders this month</th><th className="num">Monthly target</th><th className="num">Achieved</th></tr>
        </thead>
        <tbody>
          {shown.length === 0 && <tr><td colSpan={5} className="faint">No salespeople yet.</td></tr>}
          {shown.map((r) => {
            const target = Number(t[r.membershipId]) || 0;
            return (
              <tr key={r.membershipId}>
                <td>{r.name}</td>
                <td className="num">{r.open}</td>
                <td className="num">{fmtMoney(currency, r.won)}</td>
                <td className="num" style={{ width: 160 }}>
                  {canEdit ? <input className="o-input" type="number" min={0} value={t[r.membershipId] ?? ''} onChange={(e) => setT({ ...t, [r.membershipId]: e.target.value })} aria-label={`Target for ${r.name}`} /> : target ? fmtMoney(currency, target) : '-'}
                </td>
                <td className="num">{target ? <Chip tone={r.won >= target ? 'ok' : 'steel'}>{Math.round((r.won / target) * 100)}%</Chip> : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {canEdit && (
        <div className="o-row" style={{ padding: 12, borderTop: '1px solid var(--line)' }}>
          <select className="o-select" value={add} onChange={(e) => setAdd(e.target.value)} style={{ maxWidth: 260 }} aria-label="Add a salesperson">
            <option value="">Add a salesperson…</option>
            {people.filter((p) => t[p.id] === undefined).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Button size="small" disabled={!add} onClick={() => (setT({ ...t, [add]: '' }), setAdd(''))}>Add</Button>
          <Button variant="primary" disabled={busy} style={{ marginLeft: 'auto' }} onClick={() => run(() => setTargetsAction({ targets: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Number(v) || 0])) }), 'Targets saved.')}>Save targets</Button>
        </div>
      )}
    </div>
  );
}

export function SettingsClient({ cfg, team }: { cfg: SalesConfig; team: SalesPerson[] }) {
  const { busy, run } = useRun();
  const [f, setF] = useState({ managerDiscount: cfg.managerDiscount, minMargin: cfg.minMargin, gst: cfg.gst, currency: cfg.currency, validityDays: cfg.validityDays, paymentTermsDays: cfg.paymentTermsDays, defaultAdvance: cfg.defaultAdvance, terms: cfg.terms });
  const numField = (k: Exclude<keyof typeof f, 'currency' | 'terms'>, label: string) => (
    <label className="o-field">
      {label}
      <input className="o-input" type="number" min={0} value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) || 0 })} />
    </label>
  );
  return (
    <>
      <div className="o-panel">
        <h2>Approvals and quotation</h2>
        <div className="o-form-row">
          {numField('managerDiscount', 'Sales manager approves discounts up to %')}
          {numField('minMargin', 'Margin under this % goes to the GM')}
          {numField('gst', 'GST %')}
          <label className="o-field">
            Currency symbol
            <input className="o-input" value={f.currency} maxLength={4} onChange={(e) => setF({ ...f, currency: e.target.value })} />
          </label>
          {numField('validityDays', 'Quotation valid for days')}
          {numField('paymentTermsDays', 'Invoice due after days')}
          {numField('defaultAdvance', 'Default advance %')}
        </div>
        <label className="o-field" style={{ marginTop: 10 }}>
          Terms printed on quotations
          <textarea className="o-textarea" rows={4} value={f.terms} maxLength={2000} onChange={(e) => setF({ ...f, terms: e.target.value })} />
        </label>
        <div style={{ marginTop: 10 }}>
          <Button variant="primary" disabled={busy} onClick={() => run(() => saveSettingsAction(f), 'Settings saved.')}>Save settings</Button>
        </div>
      </div>
      <div className="o-panel flush">
        <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
          <h2>Sales roles</h2>
        </div>
        <table className="o-table">
          <thead>
            <tr><th>Person</th><th>Sales role</th><th>What they do</th></tr>
          </thead>
          <tbody>
            {team.map((p) => (
              <tr key={p.membershipId}>
                <td>{p.name}<div className="faint" style={{ fontSize: 11 }}>{p.email}</div></td>
                <td style={{ width: 220 }}>
                  {p.companyRole === 'company_admin' ? (
                    <Chip tone="steel">{roleLabel('admin')}</Chip>
                  ) : (
                    <select className="o-select" value={p.salesRole} disabled={busy} aria-label={`Sales role for ${p.name}`} onChange={(e) => run(() => setSalesRoleAction({ membershipId: p.membershipId, role: e.target.value }), 'Role saved.')}>
                      {SALES_ROLES.filter((r) => r.id !== 'admin').map((r) => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>{SALES_ROLES.find((r) => r.id === p.salesRole)?.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
