'use client';
import { useState } from 'react';
import { Button, TopBar } from '@orbit/ui';
import { SOURCES, UNITS } from '../config';
import { createEnquiryAction } from '../actions';
import { PageHead } from './ui';
import { useRun } from './useRun';

/** New enquiry: customer (existing or new), requirement, details and first scope lines. Documents are added on the next page. */
export function NewEnquiryClient({ customers }: { customers: { id: string; name: string; city: string | null }[] }) {
  const { busy, run, router } = useRun();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [isNew, setIsNew] = useState(customers.length === 0);
  const [nc, setNc] = useState({ name: '', city: '', contact: '', phone: '', email: '', gstin: '' });
  const [f, setF] = useState({ title: '', details: '', source: SOURCES[0], probability: 30, followUp: '' });
  const [lines, setLines] = useState([{ item: '', qty: 1, unit: UNITS[0] }]);
  return (
    <>
      <TopBar crumbs={['Sales', 'New enquiry']} />
      <div className="o-page">
        <PageHead title="New enquiry" lead="Next you can upload the project PDFs or add links for the estimator." />
        <div className="o-panel">
          <h2>Customer</h2>
          <div className="o-row" style={{ marginBottom: 10 }}>
            <Button size="small" variant={!isNew ? 'primary' : undefined} disabled={!customers.length} onClick={() => setIsNew(false)}>Existing customer</Button>
            <Button size="small" variant={isNew ? 'primary' : undefined} onClick={() => setIsNew(true)}>New customer</Button>
          </div>
          {isNew ? (
            <div className="o-form-row">
              {(['name', 'city', 'contact', 'phone', 'email', 'gstin'] as const).map((k) => (
                <label key={k} className="o-field">
                  {{ name: 'Company name', city: 'City', contact: 'Contact person', phone: 'Phone', email: 'Email', gstin: 'GSTIN' }[k]}
                  <input className="o-input" value={nc[k]} maxLength={k === 'gstin' ? 20 : 160} onChange={(e) => setNc({ ...nc, [k]: e.target.value })} />
                </label>
              ))}
            </div>
          ) : (
            <select className="o-select" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Customer">
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.city ? `, ${c.city}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="o-panel">
          <h2>Project</h2>
          <div className="o-stack" style={{ gap: 10 }}>
            <label className="o-field">
              Requirement
              <input className="o-input" value={f.title} maxLength={200} placeholder="Structural steel for warehouse shed, 40 m span" onChange={(e) => setF({ ...f, title: e.target.value })} />
            </label>
            <label className="o-field">
              Details for the estimator
              <textarea className="o-textarea" rows={5} value={f.details} maxLength={8000} placeholder="Scope, specifications, site, delivery date, anything the estimator needs" onChange={(e) => setF({ ...f, details: e.target.value })} />
            </label>
            <div className="o-form-row">
              <label className="o-field">
                Source
                <select className="o-select" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
                  {SOURCES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="o-field">
                Chance of winning %
                <input className="o-input" type="number" min={0} max={100} value={f.probability} onChange={(e) => setF({ ...f, probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
              </label>
              <label className="o-field">
                Follow-up
                <input className="o-input" type="date" value={f.followUp} onChange={(e) => setF({ ...f, followUp: e.target.value })} />
              </label>
            </div>
          </div>
        </div>
        <div className="o-panel">
          <div className="o-panel-head">
            <h2>Scope lines (optional)</h2>
            <Button size="small" onClick={() => setLines([...lines, { item: '', qty: 1, unit: UNITS[0] }])}>Add line</Button>
          </div>
          <div className="o-stack" style={{ gap: 6 }}>
            {lines.map((l, i) => (
              <div key={i} className="o-row">
                <input className="o-input" value={l.item} maxLength={300} placeholder="Item or scope" aria-label={`Line ${i + 1}`} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))} />
                <input className="o-input" type="number" min={0} step="any" value={l.qty} style={{ width: 100 }} aria-label={`Line ${i + 1} quantity`} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) || 0 } : x)))} />
                <select className="o-select" value={l.unit} style={{ width: 90 }} aria-label={`Line ${i + 1} unit`} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}>
                  {UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
                <Button size="small" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}>×</Button>
              </div>
            ))}
          </div>
        </div>
        <div className="o-row">
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              const res = await run(
                () =>
                  createEnquiryAction({
                    ...(isNew ? { newCustomer: { name: nc.name, city: nc.city, contact: nc.contact, phone: nc.phone, email: nc.email, gstin: nc.gstin } } : { customerId }),
                    title: f.title,
                    details: f.details,
                    source: f.source,
                    probability: f.probability,
                    followUp: f.followUp || undefined,
                    lines: lines.filter((l) => l.item.trim()),
                  }),
                'Enquiry created. Add the project documents.',
              );
              if (res) router.push(`/sales/enquiry?id=${res.id}`);
            }}
          >
            Create enquiry
          </Button>
        </div>
      </div>
    </>
  );
}
