import { describe, expect, it } from 'vitest';
import { BUNDLES, CURRENCIES, MIN_SEATS, SEAT_PRICE, billableSeats, extraSeatsQuote, money, planOf, priceFor, seatQuote, seatSavingPct } from './plans';

describe('per-user pricing', () => {
  it('prices every bundle in every currency', () => {
    for (const b of BUNDLES) for (const c of CURRENCIES) expect(SEAT_PRICE[b.id][c.id]).toBeGreaterThan(0);
  });

  it('starts Timesheet at ₹149 / $1.99 / £1.99 per person', () => {
    expect(SEAT_PRICE.timesheet).toEqual({ INR: 149, USD: 1.99, GBP: 1.99 });
  });

  it('prices HR alone and with Timesheet', () => {
    expect(SEAT_PRICE.hr).toEqual({ INR: 199, USD: 2.99, GBP: 2.49 });
    expect(SEAT_PRICE.hr_timesheet).toEqual({ INR: 299, USD: 3.99, GBP: 3.49 });
    expect(planOf('hr_users')?.portals).toEqual(['hr']);
    expect(planOf('hr_timesheet_users')?.portals).toEqual(['timesheet', 'hr']);
    expect(seatSavingPct('hr_timesheet', 'INR')).toBe(14);
  });

  it('bills at least 5 people', () => {
    expect(seatQuote('timesheet', 2, 'monthly', 'INR').total).toBe(149 * MIN_SEATS);
    expect(billableSeats(1)).toBe(MIN_SEATS);
  });

  it('lets 2 management viewers use it free', () => {
    expect(billableSeats(12, 3)).toBe(10);
    expect(billableSeats(12, 1)).toBe(11);
  });

  it('prices each volume band at its own rate', () => {
    // 30 people on the Complete suite in pounds: 25 x 18.99 + 5 x 16.14 (15% off).
    const q = seatQuote('complete', 30, 'monthly', 'GBP');
    expect(q.lines.map((l) => [l.people, l.each])).toEqual([
      [25, 18.99],
      [5, 16.14],
    ]);
    expect(q.perMonth).toBe(555.45);
    // 120 people: 25 full, 75 at 15% off, 20 at 25% off.
    expect(seatQuote('timesheet', 120, 'monthly', 'INR').lines.map((l) => l.people)).toEqual([25, 75, 20]);
  });

  it('applies the longer-term discount on top', () => {
    const q = seatQuote('factory', 20, 'yearly', 'INR');
    expect(q.perMonth).toBe(19_980);
    expect(q.total).toBe(Math.round(19_980 * 12 * (5 / 6))); // 2 months free
    expect(q.total).toBe(199_800);
  });

  it('keeps cents and pence exact', () => {
    expect(seatQuote('production_quality', 15, 'monthly', 'USD').total).toBe(179.85);
    expect(money(179.85, 'USD')).toBe('$179.85');
    expect(money(16.99, 'GBP')).toBe('£16.99');
  });

  it('reads per-user plan ids and keeps the older team-size plans', () => {
    expect(planOf('factory_users')).toMatchObject({ bundle: 'factory', perUser: true, name: 'Manufacturing suite' });
    expect(planOf('both_growth')).toMatchObject({ bundle: 'both', tier: 'growth', users: 40, perUser: false });
    expect(priceFor('factory', 'users', 'monthly', 'INR', 20)).toBe(19_980);
    expect(priceFor('both', 'growth', 'monthly', 'INR')).toBe(5999);
  });

  it('shows the package saving', () => {
    expect(seatSavingPct('factory', 'INR')).toBe(37);
    expect(seatSavingPct('timesheet', 'INR')).toBe(0);
  });
});

describe('extra seats', () => {
  const day = 864e5;
  it('charges the band price for each renewal and the part of the period left now', () => {
    // 25 seats on the Manufacturing suite, monthly, in rupees; 2 more fall in the 15% band.
    const end = new Date('2026-12-31T00:00:00Z');
    const now = end.getTime() - 15 * day; // half of a 30-day month left
    const q = extraSeatsQuote('factory', 25, 2, 'monthly', 'INR', end, now);
    expect(q.perCycle).toBe(2 * 849); // ₹999 less 15%
    expect(q.dueNow).toBe(849);
    expect(q.daysLeft).toBe(15);
  });

  it('charges nothing now when the period has ended', () => {
    expect(extraSeatsQuote('timesheet', 5, 1, 'yearly', 'GBP', new Date(Date.now() - day)).dueNow).toBe(0);
  });
});
