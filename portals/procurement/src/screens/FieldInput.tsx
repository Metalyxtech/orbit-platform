'use client';
import type { FormField } from '../config';

type V = string | number | boolean | null;

/** One configurable form field (text, number, dropdown, date or checkbox). */
export function FieldInput({ f, value, onChange, disabled }: { f: FormField; value: V | undefined; onChange: (v: V) => void; disabled?: boolean }) {
  if (f.type === 'check')
    return (
      <label className="o-row" style={{ gap: 6, fontSize: 13 }}>
        <input type="checkbox" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={f.label} />
        Yes
      </label>
    );
  if (f.type === 'select')
    return (
      <select className="o-select" value={String(value ?? '')} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} aria-label={f.label}>
        <option value="">Choose</option>
        {f.options
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
          .map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
      </select>
    );
  return (
    <input
      className="o-input"
      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
      value={value == null || value === false ? '' : String(value)}
      disabled={disabled}
      onChange={(e) => onChange(f.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
      aria-label={f.label}
    />
  );
}

export const showValue = (v: unknown) => (v === true ? 'Yes' : v === false || v == null || v === '' ? '-' : String(v));
