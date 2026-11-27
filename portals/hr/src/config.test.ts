import { describe, expect, it } from 'vitest';
import { markFor } from '@orbit/core/attendance';
import { leaveDays } from './config';

describe('leave days', () => {
  // Week of Sun 22 Nov 2026; Friday (5) is the weekly off.
  it('counts working days only, leaving out the weekly off and holidays', () => {
    expect(leaveDays('2026-11-23', '2026-11-28', false, [5], new Set())).toBe(5); // Mon-Sat less Friday
    expect(leaveDays('2026-11-23', '2026-11-28', false, [5], new Set(['2026-11-24']))).toBe(4);
  });
  it('counts a half day as 0.5', () => {
    expect(leaveDays('2026-11-23', '2026-11-23', true, [5], new Set())).toBe(0.5);
  });
});

describe('attendance marks', () => {
  const base = { hours: 0, weeklyOff: false, future: false, stdDayHours: 8 };
  it('marks present, half day, absent, holiday, weekly off and leave', () => {
    expect(markFor({ ...base, hours: 8 })).toBe('P');
    expect(markFor({ ...base, hours: 3 })).toBe('HD');
    expect(markFor(base)).toBe('A');
    expect(markFor({ ...base, holiday: 'Diwali' })).toBe('H');
    expect(markFor({ ...base, weeklyOff: true })).toBe('WO');
    expect(markFor({ ...base, leave: { type: 'Casual leave', code: 'CL', paid: true, halfDay: false } })).toBe('L');
    expect(markFor({ ...base, hours: 4, leave: { type: 'Casual leave', code: 'CL', paid: true, halfDay: true } })).toBe('HL');
    expect(markFor({ ...base, future: true })).toBe('-');
  });
});
