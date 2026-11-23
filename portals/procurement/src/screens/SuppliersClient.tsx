'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ConfirmDialog, DataTable, EmptyState, TopBar, useToast } from '@orbit/ui';
import { addSupplierAction } from '../actions';
import type { SupplierRow } from '../server';

export function SuppliersClient({ rows, canAdd }: { rows: SupplierRow[]; canAdd: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: '', categories: '', email: '', phone: '', rating: '' });
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  async function save() {
    const res = await addSupplierAction({ name: v.name, categories: v.categories, email: v.email || null, phone: v.phone || null, rating: v.rating === '' ? null : Number(v.rating) });
    if (!res.ok) return toast(res.error, 'bad');
    toast(`${v.name} added.`);
    setOpen(false);
    setV({ name: '', categories: '', email: '', phone: '', rating: '' });
    router.refresh();
  }
  return (
    <>
      <TopBar crumbs={['Purchase', 'Suppliers']} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Suppliers</h1>
            <p>Suppliers the purchase team asks for quotes.</p>
          </div>
          {canAdd && (
            <Button variant="primary" onClick={() => setOpen(true)}>
              Add supplier
            </Button>
          )}
        </div>
        <div className="o-panel flush">
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty={<EmptyState title="No suppliers yet." />}
            columns={[
              { key: 'n', header: 'Supplier', render: (r) => <strong>{r.name}</strong> },
              { key: 'c', header: 'Supplies', render: (r) => <span className="muted">{r.categories || '-'}</span> },
              { key: 'e', header: 'Contact', render: (r) => <>{r.email ?? ''}<div className="faint" style={{ fontSize: 11 }}>{r.phone ?? ''}</div></> },
              { key: 'r', header: 'Rating', num: true, render: (r) => (r.rating != null ? `${r.rating.toFixed(1)} / 5` : '-') },
            ]}
          />
        </div>
      </div>
      <ConfirmDialog open={open} title="Add supplier" confirmLabel="Add supplier" onConfirm={save} onCancel={() => setOpen(false)}>
        <label className="o-field">
          Name *
          <input className="o-input" value={v.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="o-field">
          Supplies (categories)
          <input className="o-input" value={v.categories} onChange={(e) => set({ categories: e.target.value })} placeholder="e.g. Rebar, couplers" />
        </label>
        <div className="o-grid2">
          <label className="o-field">
            Email
            <input className="o-input" type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} />
          </label>
          <label className="o-field">
            Phone
            <input className="o-input" value={v.phone} onChange={(e) => set({ phone: e.target.value })} />
          </label>
          <label className="o-field">
            Rating (0 to 5)
            <input className="o-input" type="number" min={0} max={5} step={0.1} value={v.rating} onChange={(e) => set({ rating: e.target.value })} />
          </label>
        </div>
      </ConfirmDialog>
    </>
  );
}
