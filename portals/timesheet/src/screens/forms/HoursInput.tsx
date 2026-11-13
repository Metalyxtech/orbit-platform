'use client';
import { useEffect, useState } from 'react';
import { parseCell } from '../../calc';

/** Hours box for one line: type freely, saved when you leave the box or press Enter. */
export function HoursInput({
  value,
  step,
  disabled,
  onChange,
  onError,
}: {
  value: number;
  step: number;
  disabled?: boolean;
  onChange: (v: number) => void;
  onError: (m: string) => void;
}) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => setText(value ? String(value) : ''), [value]);
  const commit = () => {
    const r = parseCell(text, step);
    if (!r.ok) {
      onError(r.error);
      setText(value ? String(value) : '');
      return;
    }
    if (r.value !== value) onChange(r.value);
    else setText(value ? String(value) : '');
  };
  return (
    <input
      className="o-input o-hours"
      inputMode="decimal"
      aria-label="Hours"
      placeholder="0.0"
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
