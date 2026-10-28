'use client';
import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';

export function Button({
  variant,
  size,
  block,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ok' | 'danger'; size?: 'small'; block?: boolean }) {
  return (
    <button
      type="button"
      className={['o-btn', variant, size, block ? 'block' : '', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

export function Field({ label, help, error, children }: { label: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <label className="o-field">
      {label}
      {children}
      {help && <span className="help">{help}</span>}
      {error && <span className="err">{error}</span>}
    </label>
  );
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  ...rest
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  'aria-label'?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className="o-select"
      value={String(value)}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value);
        if (o) onChange(o.value);
      }}
      {...rest}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="o-seg" role="group">
      {options.map((o) => (
        <button type="button" key={String(o.value)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="o-toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="o-empty">
      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
      {children}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  variant = 'primary',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  variant?: 'primary' | 'ok' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="o-dialog" onCancel={onCancel}>
      <h2>{title}</h2>
      <div style={{ marginBottom: 16 }}>{children}</div>
      <div className="o-row" style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant={variant} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

/** +/- 0.5 h stepper for the phone day view; tapping the number opens the numeric keypad. */
export function Stepper({
  value,
  step = 0.5,
  max = 24,
  onChange,
  disabled,
}: {
  value: number;
  step?: number;
  max?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(0, Math.round(v * 100) / 100));
  return (
    <div className="o-stepper">
      <button type="button" disabled={disabled} onClick={() => onChange(clamp(value - step))} aria-label="Less">
        -
      </button>
      <input
        inputMode="decimal"
        disabled={disabled}
        value={value.toFixed(1)}
        onChange={(e) => {
          const n = Number(e.target.value.replace(',', '.'));
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        aria-label="Hours"
      />
      <button type="button" disabled={disabled} onClick={() => onChange(clamp(value + step))} aria-label="More">
        +
      </button>
    </div>
  );
}

export function PhoneDayTabs({
  days,
  selected,
  onSelect,
}: {
  days: { name: string; total: number; over: boolean; off: boolean }[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="o-daytabs" role="tablist">
      {days.map((d, i) => (
        <button
          key={i}
          role="tab"
          aria-selected={i === selected}
          className={d.over ? 'over' : ''}
          onClick={() => onSelect(i)}
        >
          {d.name}
          <b>{d.off && d.total === 0 ? 'off' : d.total.toFixed(1)}</b>
        </button>
      ))}
    </div>
  );
}
