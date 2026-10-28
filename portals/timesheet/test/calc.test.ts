import { describe, expect, it } from 'vitest';
import {
  computeTotals,
  deadlineDate,
  defaultRules,
  parseCell,
  validateSubmit,
  weekNumber,
  weekStartFor,
  type GridRow,
} from '../src/calc';
import { messages } from '../src/messages';

// Screen 11.1: Joseph Thomas, week 44 (Sun 25 Oct to Sat 31 Oct 2026), Friday off.
const rows: GridRow[] = [
  { key: 'a', projectId: 'p1', costCodeId: 'c5120', hours: [8, 8, 8, 10.5, 8, 0, 8] },
  { key: 'b', projectId: 'p1', costCodeId: 'c5140', hours: [0, 2, 2, 0, 2, 0, 0] },
  { key: 'c', projectId: 'p2', costCodeId: 'c3010', hours: [0, 0, 0, 0, 1.5, 0, 0] },
  { key: 'd', projectId: 'p3', costCodeId: 'c9900', hours: [1, 0, 0, 0, 0, 0, 0] },
];

describe('computeTotals', () => {
  it('matches the My week screen', () => {
    const t = computeTotals(rows, defaultRules);
    expect(t.dayTotals).toEqual([9, 10, 10, 10.5, 11.5, 0, 8]);
    expect(t.rowTotals).toEqual([50.5, 6, 1.5, 1]);
    expect(t.total).toBe(59);
    expect(t.overtime).toBe(11);
    expect(t.regular).toBe(48);
    expect(t.overDays).toEqual([false, true, true, true, true, false, false]);
  });

  it('counts overtime per day when configured', () => {
    const t = computeTotals(rows, { ...defaultRules, overtimeMode: 'day' });
    // 0.4 + 0.4 + 0.9 + 1.9 = 3.6
    expect(t.overtime).toBe(3.6);
  });

  it('avoids float drift', () => {
    const t = computeTotals([{ key: 'x', projectId: 'p', costCodeId: 'c', hours: [0.1, 0.2, 0, 0, 0, 0, 0] }], defaultRules);
    expect(t.total).toBe(0.3);
  });
});

describe('parseCell', () => {
  it('rounds to the step', () => expect(parseCell('7.6', 0.25)).toEqual({ ok: true, value: 7.5 }));
  it('treats empty as zero', () => expect(parseCell('', 0.25)).toEqual({ ok: true, value: 0 }));
  it('rejects over 24 with the exact message', () =>
    expect(parseCell('25', 0.25)).toEqual({ ok: false, error: messages.cellOver24 }));
  it('accepts a comma decimal', () => expect(parseCell('7,5', 0.25)).toEqual({ ok: true, value: 7.5 }));
});

describe('validateSubmit', () => {
  it('requires a cost code on every row', () => {
    const issues = validateSubmit([{ ...rows[0], costCodeId: null }], defaultRules, 'x', '2026-10-25');
    expect(issues.map((i) => i.message)).toContain(messages.missingCostCode);
  });
  it('requires a note when a day is over the threshold', () => {
    const r: GridRow[] = [{ key: 'a', projectId: 'p', costCodeId: 'c', hours: [13, 0, 0, 0, 0, 0, 0] }];
    expect(validateSubmit(r, defaultRules, '', '2026-10-25').map((i) => i.message)).toContain(messages.noteRequired(12));
    expect(validateSubmit(r, defaultRules, 'crane delay', '2026-10-25').filter((i) => i.level === 'error')).toEqual([]);
  });
  it('warns, but allows, hours on the weekly off', () => {
    const r: GridRow[] = [{ key: 'a', projectId: 'p', costCodeId: 'c', hours: [0, 0, 0, 0, 0, 4, 0] }];
    const issues = validateSubmit(r, defaultRules, '', '2026-10-25');
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('warning');
  });
});

describe('dates', () => {
  it('finds the week start', () => {
    expect(weekStartFor('2026-10-28', 0)).toBe('2026-10-25');
    expect(weekStartFor('2026-10-28', 1)).toBe('2026-10-26');
  });
  it('numbers the week like the screens', () => expect(weekNumber('2026-10-25')).toBe(44));
  it('puts the deadline on the Sunday after the week', () => expect(deadlineDate('2026-10-25', 0)).toBe('2026-11-01'));
});
