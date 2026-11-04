'use client';
import { useState } from 'react';
import { Button, TopBar } from '@orbit/ui';
import { saveMoneyAction } from '../../actions';
import type { ProcConfig } from '../../config';
import { useSave } from './useSave';

/** Admin > Money and numbering: currency, tax, invoice tolerance and number prefixes. */
export function MoneyClient({ money, numbering }: { money: ProcConfig['money']; numbering: ProcConfig['numbering'] }) {
  const { busy, save } = useSave();
  const [v, setV] = useState({ ...money, ...numbering });
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  return (
    <>
      <TopBar crumbs={['Purchase', 'Admin', 'Money and numbering']} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Money and numbering</h1>
            <p>Currency, tax and the numbers on requisitions and purchase orders.</p>
          </div>
          <Button variant="primary" disabled={busy} onClick={() => save(() => saveMoneyAction(v), 'Settings saved.')}>
            Save settings
          </Button>
        </div>
        <div className="o-panel" style={{ maxWidth: 720 }}>
          <h2>Money and tax</h2>
          <div className="o-grid2">
            <label className="o-field">
              Currency symbol
              <input className="o-input" value={v.currency} onChange={(e) => set({ currency: e.target.value })} />
              <span className="help">For example $, €, £, ₹, AED</span>
            </label>
            <label className="o-field">
              Tax name
              <input className="o-input" value={v.taxName} onChange={(e) => set({ taxName: e.target.value })} />
              <span className="help">For example GST or VAT</span>
            </label>
            <label className="o-field">
              Tax rate (%)
              <input className="o-input" type="number" min={0} max={50} step="any" value={v.taxRate} onChange={(e) => set({ taxRate: Number(e.target.value) })} />
            </label>
            <label className="o-field">
              Invoice match tolerance (%)
              <input className="o-input" type="number" min={0} max={20} step="any" value={v.tolerance} onChange={(e) => set({ tolerance: Number(e.target.value) })} />
              <span className="help">Invoices within this difference match without approval</span>
            </label>
          </div>
        </div>
        <div className="o-panel" style={{ maxWidth: 720 }}>
          <h2>Numbering</h2>
          <div className="o-grid2">
            <label className="o-field">
              Requisition prefix
              <input className="o-input" value={v.prPrefix} onChange={(e) => set({ prPrefix: e.target.value.toUpperCase() })} />
            </label>
            <label className="o-field">
              Purchase order prefix
              <input className="o-input" value={v.poPrefix} onChange={(e) => set({ poPrefix: e.target.value.toUpperCase() })} />
            </label>
          </div>
        </div>
      </div>
    </>
  );
}
