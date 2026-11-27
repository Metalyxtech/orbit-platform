'use client';
import Link from 'next/link';
import { useState } from 'react';
import { BundlePicker, CycleSwitch, SeatCalculator, seatRules, trustFor } from '@/billing/PlanCards';
import { BUNDLES, CURRENCIES, SEAT_PRICE, TRIAL_DAYS, money, seatSavingPct, type Bundle, type Currency, type Cycle } from '@/billing/plans';

/** The biggest package saving, for the headline (worked out from the prices, never typed in). */
const maxSaving = Math.max(...BUNDLES.map((b) => seatSavingPct(b.id)));

export function PricingClient() {
  const [cycle, setCycle] = useState<Cycle>('yearly');
  const [bundle, setBundle] = useState<Bundle>('factory');
  const [currency, setCurrency] = useState<Currency>('INR');
  const [seats, setSeats] = useState(20);
  const from = money(SEAT_PRICE.timesheet[currency], currency);
  return (
    <main className="b-public">
      <header className="b-public-head">
        <div className="o-row" style={{ gap: 10 }}>
          <div className="o-brand-mark" aria-hidden />
          <strong style={{ color: '#fff', fontSize: 18 }}>SteelConnect360</strong>
        </div>
        <div className="o-row" style={{ gap: 8 }}>
          <Link className="o-btn" href="/sign-in">
            Sign in
          </Link>
          <Link className="o-btn primary" href="/auth/login?hint=sign-up">
            Start free trial
          </Link>
        </div>
      </header>
      <section className="b-hero">
        <h1>Pay only for the people who use it. From {from} per person.</h1>
        <p>
          Sales, purchasing, production, quality, timesheets and HR for manufacturing and project companies. Combine portals and save up to {maxSaving}%. Try everything free
          for {TRIAL_DAYS} days.
        </p>
      </section>
      <div className="b-public-body">
        <div className="b-steps" style={{ alignItems: 'center' }}>
          <span className="b-step">Where is your company?</span>
          <div className="b-cycle" role="group" aria-label="Currency">
            {CURRENCIES.map((c) => (
              <button key={c.id} type="button" aria-pressed={currency === c.id} onClick={() => setCurrency(c.id)}>
                {c.where} ({money(0, c.id).replace(/0/g, '')})
              </button>
            ))}
          </div>
        </div>
        <div className="b-steps">
          <span className="b-step">1. Choose portals</span>
          <BundlePicker bundle={bundle} onChange={setBundle} currency={currency} />
        </div>
        <div className="b-steps" style={{ alignItems: 'center' }}>
          <span className="b-step">2. How often to pay</span>
          <CycleSwitch cycle={cycle} onChange={setCycle} />
        </div>
        <div className="b-steps">
          <span className="b-step">3. How many people</span>
          <SeatCalculator
            bundle={bundle}
            cycle={cycle}
            currency={currency}
            seats={seats}
            onSeats={setSeats}
            action={
              <Link className="o-btn block primary" href="/auth/login?hint=sign-up">
                Start {TRIAL_DAYS}-day free trial
              </Link>
            }
          />
        </div>
        <ul className="b-rules">
          {seatRules(currency).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Over 150 people or several companies? <a href="mailto:sales@metalyxtech.com?subject=SteelConnect360%20Enterprise">Talk to us</a> about an Enterprise price.
        </p>
        <ul className="b-trust">
          {trustFor(currency).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="faint" style={{ fontSize: 12, textAlign: 'center' }}>
          <Link href="/legal/terms">Terms and Conditions</Link> · <Link href="/legal/privacy">Privacy Policy</Link>
        </p>
      </div>
    </main>
  );
}
