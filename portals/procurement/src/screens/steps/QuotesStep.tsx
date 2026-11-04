'use client';
import { useState } from 'react';
import { Button } from '@orbit/ui';
import { addQuoteAction, addSupplierAction, awardAction } from '../../actions';
import type { RequestDetail, SupplierRow } from '../../server';
import { fmtMoney } from '../ui';
import { useStep } from './useStep';

/** Sourcing: enter quotes, then award the chosen supplier once enough quotes are in. */
export function QuotesStep({ d, suppliers }: { d: RequestDetail; suppliers: SupplierRow[] }) {
  const { busy, run } = useStep();
  const cur = d.cfg.money.currency;
  const [supplierId, setSupplierId] = useState('');
  const [rates, setRates] = useState<(number | null)[]>(d.lines.map(() => null));
  const [leadDays, setLeadDays] = useState<number | null>(14);
  const [terms, setTerms] = useState('30 days');
  const used = new Set(d.quotes.map((q) => q.supplier));
  const free = suppliers.filter((s) => !used.has(s.name));
  const enough = d.quotes.length >= d.cfg.minQuotes;
  const [newSup, setNewSup] = useState({ open: suppliers.length === 0, name: '', categories: '', email: '' });
  async function createSupplier() {
    const ok = await run(
      () => addSupplierAction({ name: newSup.name, categories: newSup.categories, email: newSup.email || null, phone: null, rating: null }),
      `${newSup.name} added. Choose it below to enter the quote.`,
    );
    if (ok) setNewSup({ open: false, name: '', categories: '', email: '' });
  }
  const best = d.quotes.length ? d.quotes.reduce((a, b) => (b.total < a.total ? b : a)) : null;

  async function add() {
    const ok = await run(
      () => addQuoteAction({ id: d.request.id, supplierId, rates: rates.map((r) => r ?? 0), leadDays, terms: terms || null }),
      'Quote added.',
    );
    if (ok) {
      setSupplierId('');
      setRates(d.lines.map(() => null));
    }
  }

  return (
    <div className="o-stack" style={{ gap: 12 }}>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        {d.quotes.length} of {d.cfg.minQuotes} quotes needed before award.
      </p>
      {d.quotes.map((q) => (
        <div key={q.id} className={`p-quote${best?.id === q.id ? ' best' : ''}`}>
          <div>
            <strong>{q.supplier}</strong>
            <div className="faint" style={{ fontSize: 11 }}>
              {q.leadDays != null ? `${q.leadDays} days` : ''} {q.terms ? `· ${q.terms}` : ''} {best?.id === q.id ? '· Lowest' : ''}
            </div>
          </div>
          <strong>{fmtMoney(cur, q.total)}</strong>
          <Button size="small" variant="primary" disabled={!enough || busy} onClick={() => run(() => awardAction({ id: d.request.id, quoteId: q.id }), `Awarded to ${q.supplier}.`)}>
            Award
          </Button>
        </div>
      ))}
      <div className="p-subcard">
        <strong style={{ fontSize: 13 }}>Add a quote</strong>
        {newSup.open ? (
          <div className="o-stack" style={{ gap: 8 }}>
            <span className="faint" style={{ fontSize: 12 }}>
              {suppliers.length === 0 ? 'No suppliers yet. Add the first one here.' : 'New supplier'}
            </span>
            <input className="o-input" placeholder="Supplier name *" value={newSup.name} onChange={(e) => setNewSup({ ...newSup, name: e.target.value })} aria-label="Supplier name" />
            <input className="o-input" placeholder="Supplies (e.g. Rebar, couplers)" value={newSup.categories} onChange={(e) => setNewSup({ ...newSup, categories: e.target.value })} aria-label="Supplies" />
            <input className="o-input" type="email" placeholder="Email (optional)" value={newSup.email} onChange={(e) => setNewSup({ ...newSup, email: e.target.value })} aria-label="Supplier email" />
            <div className="o-row">
              <Button variant="primary" disabled={busy || newSup.name.trim().length < 2} onClick={createSupplier}>
                Add supplier
              </Button>
              {suppliers.length > 0 && <Button onClick={() => setNewSup({ ...newSup, open: false })}>Cancel</Button>}
            </div>
          </div>
        ) : (
          <>
            <button type="button" className="o-dayline-add" style={{ marginTop: 0 }} onClick={() => setNewSup({ ...newSup, open: true })}>
              + New supplier
            </button>
            <label className="o-field">
              Supplier
              <select className="o-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Choose supplier</option>
                {free.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {d.lines.map((l, i) =>
              l.buy > 0 ? (
                <label key={l.id} className="o-field">
                  Rate: {l.description} ({l.buy} {l.unit})
                  <input
                    className="o-input num"
                    type="number"
                    min={0}
                    step="any"
                    placeholder={String(l.estRate)}
                    value={rates[i] ?? ''}
                    onChange={(e) => setRates((rs) => rs.map((v, j) => (j === i ? (e.target.value === '' ? null : Number(e.target.value)) : v)))}
                  />
                </label>
              ) : null,
            )}
            <div className="o-grid2">
              <label className="o-field">
                Lead time (days)
                <input className="o-input" type="number" min={0} value={leadDays ?? ''} onChange={(e) => setLeadDays(e.target.value === '' ? null : Number(e.target.value))} />
              </label>
              <label className="o-field">
                Payment terms
                <input className="o-input" value={terms} onChange={(e) => setTerms(e.target.value)} />
              </label>
            </div>
            <Button block disabled={busy || !supplierId} onClick={add}>
              Add quote
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
