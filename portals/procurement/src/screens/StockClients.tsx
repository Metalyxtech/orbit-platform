'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ConfirmDialog, TopBar, useToast } from '@orbit/ui';
import { addItemAction, stockEntryAction } from '../actions';
import { fmtQty } from './ui';

/** "Add item" button and dialog on the stock register. */
export function AddItemClient({ defaultUnit }: { defaultUnit: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ code: '', name: '', category: '', unit: defaultUnit, reorderLevel: 0, location: '', avgCost: 0 });
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  async function save() {
    const res = await addItemAction({ ...v, location: v.location || null });
    if (!res.ok) return toast(res.error, 'bad');
    toast(`${v.code.toUpperCase()} added. Book its opening stock in Stock entry.`);
    setOpen(false);
    setV({ code: '', name: '', category: '', unit: defaultUnit, reorderLevel: 0, location: '', avgCost: 0 });
    router.refresh();
  }
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Add stock item
      </Button>
      <ConfirmDialog open={open} title="Add stock item" confirmLabel="Add item" onConfirm={save} onCancel={() => setOpen(false)}>
        <div className="o-grid2">
          <label className="o-field">
            Item code *
            <input className="o-input" value={v.code} onChange={(e) => set({ code: e.target.value })} placeholder="e.g. RB-16" />
          </label>
          <label className="o-field">
            Unit *
            <input className="o-input" value={v.unit} onChange={(e) => set({ unit: e.target.value })} />
          </label>
        </div>
        <label className="o-field">
          Name *
          <input className="o-input" value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Rebar 16 mm B500B" />
        </label>
        <div className="o-grid2">
          <label className="o-field">
            Category
            <input className="o-input" value={v.category} onChange={(e) => set({ category: e.target.value })} />
          </label>
          <label className="o-field">
            Location
            <input className="o-input" value={v.location} onChange={(e) => set({ location: e.target.value })} />
          </label>
          <label className="o-field">
            Reorder level
            <input className="o-input" type="number" min={0} step="any" value={v.reorderLevel} onChange={(e) => set({ reorderLevel: Number(e.target.value) })} />
          </label>
          <label className="o-field">
            Unit cost
            <input className="o-input" type="number" min={0} step="any" value={v.avgCost} onChange={(e) => set({ avgCost: Number(e.target.value) })} />
          </label>
        </div>
      </ConfirmDialog>
    </>
  );
}

type Item = { id: string; code: string; name: string; unit: string; onHand: number; available: number };
const TYPES = [
  { id: 'IN', label: 'Receipt into stock' },
  { id: 'OUT', label: 'Issue to site' },
  { id: 'RET', label: 'Return from site' },
  { id: 'ADJ', label: 'Adjustment (stock take)' },
] as const;

/** Stock entry: receipts, issues, returns and adjustments outside a purchase request. */
export function StockEntryClient({ items }: { items: Item[] }) {
  const router = useRouter();
  const toast = useToast();
  const [itemId, setItemId] = useState(items[0]?.id ?? '');
  const [type, setType] = useState<(typeof TYPES)[number]['id']>('IN');
  const [qty, setQty] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const it = items.find((i) => i.id === itemId);
  async function save() {
    setBusy(true);
    const res = await stockEntryAction({ itemId, type, qty: qty ?? 0, rate: type === 'IN' || type === 'RET' ? rate : null, reference: reference || null, note: note || null });
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast(`Saved. ${it?.code} now has ${fmtQty(res.data.onHand)} ${it?.unit} on hand.`);
    setQty(null);
    setReference('');
    setNote('');
    router.refresh();
  }
  return (
    <>
      <TopBar crumbs={['Purchase', 'Stock entry']} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Stock entry</h1>
            <p>Opening stock, issues to site, returns and stock-take adjustments. Purchase receipts are booked from the request.</p>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="o-panel">Add stock items in the Stock register first.</div>
        ) : (
          <div className="o-panel" style={{ maxWidth: 640 }}>
            <div className="o-stack" style={{ gap: 12 }}>
              <label className="o-field">
                Item
                <select className="o-select" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.code} {i.name}
                    </option>
                  ))}
                </select>
                {it && (
                  <span className="help">
                    {fmtQty(it.onHand)} {it.unit} on hand, {fmtQty(it.available)} free
                  </span>
                )}
              </label>
              <label className="o-field">
                Entry type
                <select className="o-select" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                  {TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="o-grid2">
                <label className="o-field">
                  Quantity {type === 'ADJ' ? '(use minus to reduce)' : ''} *
                  <input className="o-input num" type="number" step="any" value={qty ?? ''} onChange={(e) => setQty(e.target.value === '' ? null : Number(e.target.value))} />
                </label>
                {(type === 'IN' || type === 'RET') && (
                  <label className="o-field">
                    Unit cost (optional)
                    <input className="o-input num" type="number" min={0} step="any" value={rate ?? ''} onChange={(e) => setRate(e.target.value === '' ? null : Number(e.target.value))} />
                  </label>
                )}
              </div>
              <label className="o-field">
                Reference
                <input className="o-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Stock take Nov, issue slip 112" />
              </label>
              <label className="o-field">
                Note
                <input className="o-input" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <Button variant="primary" disabled={busy || !qty} onClick={save}>
                Save entry
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
