import { describe, expect, it } from 'vitest';
import { needsGm, DEFAULT_CONFIG, DOCS, docLimit, fmtShort, quoteTotals, suggestedRate, unitCost } from './config';

describe('quoteTotals', () => {
  it('works out discount, GST, cost and margin', () => {
    const t = quoteTotals([{ qty: 10, rate: 1000, cost: 700 }], 10, 18);
    expect(t.gross).toBe(10000);
    expect(t.disc).toBe(1000);
    expect(t.net).toBe(9000);
    expect(t.tax).toBe(1620);
    expect(t.total).toBe(10620);
    expect(t.cost).toBe(7000);
    expect(t.margin).toBeCloseTo(22.22, 2);
  });
  it('has no margin without a price', () => {
    expect(quoteTotals([], 0, 18).margin).toBe(0);
  });
});

describe('needsGm', () => {
  const always = DEFAULT_CONFIG; // GM gives final approval on every quotation
  const limit = { ...DEFAULT_CONFIG, gmApproval: 'over_limit' as const }; // manager up to 10%, GM under 12% margin
  it('always goes to the GM by default', () => expect(needsGm(0, 30, true, always)).toBe(true));
  it('stops at the sales manager within limits', () => expect(needsGm(8, 30, true, limit)).toBe(false));
  it('sends big discounts to the GM', () => expect(needsGm(12, 30, true, limit)).toBe(true));
  it('sends low margins to the GM', () => expect(needsGm(0, 5, true, limit)).toBe(true));
  it('ignores margin before costs are in', () => expect(needsGm(0, 0, false, limit)).toBe(false));
});

describe('project documents', () => {
  it('allows ten PDFs of up to 100 MB or images of up to 20 MB', () => {
    expect(DOCS.maxFiles).toBe(10);
    expect(docLimit('application/pdf')).toBe(100 * 1024 * 1024);
    expect(docLimit('image/jpeg')).toBe(20 * 1024 * 1024);
    expect(docLimit('application/zip')).toBe(0);
  });
  it('suggests rates from cost and markup', () => {
    expect(unitCost({ material: 40000, labour: 8000, other: 2000 })).toBe(50000);
    expect(suggestedRate(50000, 18)).toBe(59000);
  });
});

it('formats lakh and crore', () => {
  expect(fmtShort('₹', 4637600)).toBe('₹46.4 L');
  expect(fmtShort('₹', 12500000)).toBe('₹1.25 Cr');
});
