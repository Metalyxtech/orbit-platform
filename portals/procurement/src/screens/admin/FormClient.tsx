'use client';
import { useEffect, useState } from 'react';
import { Button, TopBar } from '@orbit/ui';
import { saveFormAction } from '../../actions';
import type { FieldType, FormField, ProcConfig } from '../../config';
import { FieldInput } from '../FieldInput';
import { TemplatePicker, type TemplateInfo } from './TemplatePicker';
import { useSave } from './useSave';

const TYPES: { id: FieldType; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'number', label: 'Number' },
  { id: 'select', label: 'Dropdown' },
  { id: 'date', label: 'Date' },
  { id: 'check', label: 'Checkbox' },
];
const newId = (label: string, taken: string[]) => {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20) || 'field';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}_${n}`;
  return id;
};

function FieldTable({ title, lead, fields, library, onChange }: { title: string; lead: string; fields: FormField[]; library: FormField[]; onChange: (f: FormField[]) => void }) {
  const taken = new Set(fields.map((f) => f.label.toLowerCase()));
  const extra = library.filter((f) => !taken.has(f.label.toLowerCase()));
  const set = (i: number, p: Partial<FormField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const move = (i: number) => {
    const next = [...fields];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
  };
  return (
    <div className="o-panel flush">
      <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
        <h2>{title}</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          {lead}
        </span>
      </div>
      <div className="o-scroll">
        <table className="o-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Type</th>
              <th>Dropdown choices (comma separated)</th>
              <th>Required</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={f.id}>
                <td style={{ minWidth: 180 }}>
                  <input className="o-input" value={f.label} onChange={(e) => set(i, { label: e.target.value })} aria-label="Label" />
                </td>
                <td style={{ minWidth: 120 }}>
                  <select className="o-select" value={f.type} onChange={(e) => set(i, { type: e.target.value as FieldType })} aria-label="Type">
                    {TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ minWidth: 200 }}>
                  <input className="o-input" value={f.options} disabled={f.type !== 'select'} placeholder={f.type === 'select' ? 'Choice 1, Choice 2' : 'Dropdowns only'} onChange={(e) => set(i, { options: e.target.value })} aria-label="Choices" />
                </td>
                <td>
                  <input type="checkbox" checked={f.required} onChange={(e) => set(i, { required: e.target.checked })} aria-label="Required" />
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="o-btn small" disabled={i === 0} onClick={() => move(i)} aria-label="Move up">
                    Up
                  </button>{' '}
                  <button type="button" className="o-btn small" onClick={() => onChange(fields.filter((_, j) => j !== i))} aria-label="Delete field">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {fields.length === 0 && (
              <tr>
                <td colSpan={5} className="faint">
                  No fields.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ padding: 12 }}>
        <button type="button" className="o-dayline-add" onClick={() => onChange([...fields, { id: newId('New field', fields.map((f) => f.id)), label: 'New field', type: 'text', options: '', required: false }])}>
          + Add field
        </button>
      </div>
      {extra.length > 0 && (
        <div className="p-lib">
          <span>Quick add:</span>
          {extra.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange([...fields, { ...f, id: newId(f.label, fields.map((x) => x.id)) }])}
              title={`Add "${f.label}"`}
            >
              + {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Admin > Requisition form: header and line fields, with a live preview. */
export function FormClient({
  form,
  templates,
  current,
  library,
}: {
  form: ProcConfig['form'];
  templates: TemplateInfo[];
  current: string;
  library: { header: FormField[]; line: FormField[] };
}) {
  const { busy, save } = useSave();
  const [v, setV] = useState(form);
  useEffect(() => setV(form), [form]);
  return (
    <>
      <TopBar crumbs={['Purchase', 'Admin', 'Requisition form']} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>Requisition form</h1>
            <p>The form people fill in to raise a request. Changes affect new requests only.</p>
          </div>
          <Button variant="primary" disabled={busy} onClick={() => save(() => saveFormAction(v), 'Form saved.')}>
            Save form
          </Button>
        </div>
        <TemplatePicker templates={templates} current={current} />
        <div className="o-panel">
          <div className="o-grid2">
            <label className="o-field">
              Form name
              <input className="o-input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </label>
            <label className="o-field">
              Default unit
              <input className="o-input" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} />
            </label>
          </div>
        </div>
        <FieldTable title="Header fields" lead="Asked once per request: drawing refs, packages, certificates" fields={v.header} library={library.header} onChange={(header) => setV({ ...v, header })} />
        <FieldTable title="Line fields" lead="Columns next to description, quantity, unit and rate" fields={v.line} library={library.line} onChange={(line) => setV({ ...v, line })} />
        <div className="o-panel p-preview">
          <span className="p-preview-tag">Live preview</span>
          <div className="p-fields">
            {v.header.map((f) => (
              <label key={f.id} className="o-field">
                {f.label}
                {f.required ? ' *' : ''}
                <FieldInput f={f} value={undefined} onChange={() => {}} />
              </label>
            ))}
          </div>
          <div className="o-scroll" style={{ marginTop: 12 }}>
            <table className="o-table">
              <thead>
                <tr>
                  <th>Description *</th>
                  {v.line.map((f) => (
                    <th key={f.id}>
                      {f.label}
                      {f.required ? ' *' : ''}
                    </th>
                  ))}
                  <th>Qty *</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <input className="o-input" placeholder="Item description" readOnly />
                  </td>
                  {v.line.map((f) => (
                    <td key={f.id}>
                      <FieldInput f={f} value={undefined} onChange={() => {}} />
                    </td>
                  ))}
                  <td>
                    <input className="o-input" readOnly />
                  </td>
                  <td>
                    <input className="o-input" value={v.unit} readOnly />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
