import { describe, expect, it } from 'vitest';
import { approverFor, DEFAULT_CONFIG, DOCS, docLimit, fmtShort, quoteTotals, suggestedRate, unitCost } from './config';

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

describe('approverFor', () => {
  const cfg = DEFAULT_CONFIG; // manager up to 10%, GM under 12% margin
  it('needs nobody without a discount and a healthy margin', () => expect(approverFor(0, 30, true, cfg)).toBeNull());
  it('sends small discounts to the sales manager', () => expect(approverFor(8, 30, true, cfg)).toBe('manager'));
  it('sends big discounts to the GM', () => expect(approverFor(12, 30, true, cfg)).toBe('gm'));
  it('sends low margins to the GM even without a discount', () => expect(approverFor(0, 5, true, cfg)).toBe('gm'));
  it('ignores margin before costs are in', () => expect(approverFor(0, 0, false, cfg)).toBeNull());
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
