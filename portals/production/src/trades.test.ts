import { describe, expect, it } from 'vitest';
import { pct, PROD_ROLES, WO_FLOW } from './config';
import { TRADES, tradeOf } from './trades';

describe('trade forms', () => {
  it('have unique ids and the general fallback last', () => {
    expect(new Set(TRADES.map((t) => t.id)).size).toBe(TRADES.length);
    expect(TRADES.at(-1)!.id).toBe('general');
    expect(tradeOf('nope').id).toBe('general');
  });
  it.each(TRADES.map((t) => [t.name, t] as const))('%s is complete', (_, t) => {
    expect(t.fields.length).toBeGreaterThan(0);
    expect(new Set(t.fields.map((f) => f.id)).size).toBe(t.fields.length);
    for (const f of t.fields) if (f.type === 'select') expect(f.options?.length).toBeGreaterThan(1);
    expect(t.operations.length).toBeGreaterThan(2);
    expect(t.operations.some((o) => o.qc)).toBe(true);
    expect(t.checklist.length).toBeGreaterThan(1);
    expect(t.finalChecklist.length).toBeGreaterThan(1);
    expect(t.units).toContain(t.unit);
  });
});

describe('config', () => {
  it('has the shop-floor roles', () => {
    expect(PROD_ROLES.map((r) => r.id)).toEqual(['engineer', 'manager', 'supervisor', 'qc', 'store', 'gm', 'admin']);
  });
  it('tracks a work order from draft to dispatch', () => {
    expect(WO_FLOW[0]).toBe('draft');
    expect(WO_FLOW.at(-1)).toBe('dispatched');
  });
  it('caps progress at 100%', () => {
    expect(pct(5, 10)).toBe(50);
    expect(pct(12, 10)).toBe(100);
    expect(pct(1, 0)).toBe(0);
  });
});
