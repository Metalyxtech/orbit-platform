'use client';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export type CellParse = (input: string) => { ok: true; value: number } | { ok: false; error: string };

export interface WeekGridRow {
  key: string;
  label: ReactNode;
  hours: number[];
}

export interface WeekGridProps {
  days: { name: string; label: string; weeklyOff: boolean }[];
  rows: WeekGridRow[];
  rowTotals: number[];
  dayTotals: number[];
  overDays: boolean[];
  total: number;
  readOnly?: boolean;
  parse: CellParse;
  onChange: (rowIndex: number, day: number, value: number) => void;
  /** Paste of a row from Excel: tab separated values starting at a cell. */
  onPaste: (rowIndex: number, startDay: number, values: number[]) => void;
  onRemoveRow?: (rowIndex: number) => void;
  onError?: (message: string) => void;
}

const fmt = (h: number) => (h ? h.toFixed(1) : '');

/**
 * Spreadsheet-like week entry. Arrow keys, Tab and Enter move between cells.
 * Typing replaces the value, which is validated to the step and 0-24.
 */
export function WeekGrid(props: WeekGridProps) {
  const refs = useRef(new Map<string, HTMLInputElement>());
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);

  const id = (r: number, d: number) => `${r}:${d}`;
  const focus = (r: number, d: number) => {
    const el = refs.current.get(id(r, d));
    if (el) {
      el.focus();
      el.select();
    }
  };

  function commit(r: number, d: number, text: string) {
    const res = props.parse(text);
    if (!res.ok) {
      setInvalid(id(r, d));
      props.onError?.(res.error);
      return false;
    }
    setInvalid(null);
    if (res.value !== props.rows[r].hours[d]) props.onChange(r, d, res.value);
    return true;
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>, r: number, d: number) {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      Enter: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const mv = moves[e.key];
    if (!mv) {
      if (e.key === 'Escape') setDraft(null);
      return;
    }
    // Left / right only leave the cell when the caret is at the edge of the text.
    const el = e.currentTarget;
    if (e.key === 'ArrowLeft' && el.selectionStart !== 0) return;
    if (e.key === 'ArrowRight' && el.selectionEnd !== el.value.length) return;
    e.preventDefault();
    if (draft && draft.id === id(r, d) && !commit(r, d, draft.text)) return;
    setDraft(null);
    const nr = Math.min(props.rows.length - 1, Math.max(0, r + mv[0]));
    const nd = Math.min(6, Math.max(0, d + mv[1]));
    focus(nr, nd);
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>, r: number, d: number) {
    const text = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(text.trim())) return; // single value: normal paste
    e.preventDefault();
    const cells = text.trim().split(/\r?\n/)[0].split('\t');
    const values: number[] = [];
    for (const c of cells.slice(0, 7 - d)) {
      const res = props.parse(c);
      if (!res.ok) {
        props.onError?.(res.error);
        return;
      }
      values.push(res.value);
    }
    setDraft(null);
    props.onPaste(r, d, values);
  }

  return (
    <table className="o-week">
      <thead>
        <tr>
          <th>Project and cost code</th>
          {props.days.map((day) => (
            <th key={day.name + day.label}>
              {day.name}
              <span className="d">{day.label}</span>
            </th>
          ))}
          <th>Total</th>
          {props.onRemoveRow && !props.readOnly && <th aria-label="Remove" />}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row, r) => (
          <tr key={row.key}>
            <td className="label">{row.label}</td>
            {row.hours.map((h, d) => {
              const cid = id(r, d);
              const editing = draft?.id === cid;
              return (
                <td key={d} className={props.days[d].weeklyOff ? 'off' : undefined}>
                  <input
                    ref={(el) => {
                      if (el) refs.current.set(cid, el);
                      else refs.current.delete(cid);
                    }}
                    className={`cell ${invalid === cid ? 'invalid' : ''}`}
                    inputMode="decimal"
                    aria-label={`${props.days[d].name} hours`}
                    placeholder="-"
                    readOnly={props.readOnly}
                    value={editing ? draft.text : fmt(h)}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setDraft({ id: cid, text: e.target.value })}
                    onBlur={() => {
                      if (editing) {
                        commit(r, d, draft.text);
                        setDraft(null);
                      }
                    }}
                    onKeyDown={(e) => onKeyDown(e, r, d)}
                    onPaste={(e) => onPaste(e, r, d)}
                  />
                </td>
              );
            })}
            <td className="total">{props.rowTotals[r]?.toFixed(1)}</td>
            {props.onRemoveRow && !props.readOnly && (
              <td style={{ width: 32 }}>
                <button type="button" className="rm" aria-label="Remove row" onClick={() => props.onRemoveRow!(r)}>
                  ×
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td className="label">Day total</td>
          {props.dayTotals.map((t, d) => (
            <td key={d} className={props.overDays[d] ? 'over' : undefined}>
              {t.toFixed(1)}
            </td>
          ))}
          <td className="total">{props.total.toFixed(1)}</td>
          {props.onRemoveRow && !props.readOnly && <td />}
        </tr>
      </tfoot>
    </table>
  );
}
