import { describe, expect, it } from 'vitest';
import {
  computeTotals,
  deadlineDate,
  defaultRules,
  parseCell,
  validateSubmit,
  weekNumber,
  weekStartFor,
  weightedOt,
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

describe('roster and overtime', () => {
  // Week from Sun 25 Oct 2026; Friday (index 5) is the weekly off in the default rules.
  const week = '2026-10-25';
  const day = (hours: number[]): GridRow[] => [{ key: 'a', projectId: 'p1', costCodeId: 'c1', hours }];
  const shift = (h: number, preApproved = 0) => ({ kind: 'shift' as const, shiftName: 'Day', hours: h, preApproved });
  const off = { kind: 'off' as const, preApproved: 0 };
  const none = { kind: null, preApproved: 0 };

  it('keeps the old count when nothing is rostered', () => {
    const t = computeTotals(day([10, 10, 10, 10, 10, 0, 0]), defaultRules, Array(7).fill(none), week);
    expect(t.rostered).toBe(false);
    expect(t.overtime).toBe(2); // 50 h in the week, standard 48
  });

  it('counts each rostered day against its shift, and all hours on a day off', () => {
    const plan = [shift(8), shift(8), shift(8), shift(8), shift(8), off, off];
    const t = computeTotals(day([9, 8, 8, 8, 8, 4, 0]), defaultRules, plan, week);
    expect(t.rostered).toBe(true);
    expect(t.overtime).toBe(5); // 1 h on Sunday + 4 h on the rostered day off
    expect(t.workdayOt).toBe(1);
    expect(t.offdayOt).toBe(4);
  });

  it('splits overtime into pre-approved and not', () => {
    const plan = [shift(8, 2), shift(8), shift(8), shift(8), shift(8), off, off];
    const t = computeTotals(day([11, 9, 8, 8, 8, 0, 0]), defaultRules, plan, week);
    expect(t.overtime).toBe(4);
    expect(t.preApprovedOt).toBe(2); // only Sunday's 2 h were planned
    expect(t.notPreApprovedOt).toBe(2);
  });

  it('makes hours on a public holiday overtime, with or without a roster', () => {
    const plan = Array(7).fill(none).map((p, d) => (d === 1 ? { ...p, holiday: 'Diwali' } : p));
    const t = computeTotals(day([8, 6, 8, 8, 8, 0, 8]), defaultRules, plan, week);
    expect(t.offdayOt).toBe(6);
    expect(t.overtime).toBe(6); // the other 40 h stay under the 48 h week
  });

  it('asks for a reason only for overtime that was not planned or approved', () => {
    const plan = [shift(8, 1), shift(8), shift(8), shift(8), shift(8), off, off];
    const issues = validateSubmit(day([9, 9, 8, 8, 8, 0, 0]), defaultRules, '', week, plan);
    expect(issues.some((i) => i.message === messages.otReasonRequired(1))).toBe(true);
    expect(validateSubmit(day([9, 8, 8, 8, 8, 0, 0]), defaultRules, '', week, plan).some((i) => i.message.includes('not planned'))).toBe(false);
  });

  it('weights overtime by the payroll rates', () => {
    expect(weightedOt({ workdayOt: 2, offdayOt: 4 }, { workday: 1.5, offday: 2 })).toBe(11);
  });
});
