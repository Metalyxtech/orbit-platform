'use client';
import Link from 'next/link';
import { useState } from 'react';
import { BundlePicker, CycleSwitch, PlanCards, trustFor } from '@/billing/PlanCards';
import { BUNDLES, TIERS, TRIAL_DAYS, bundleSavingPct, taxNote, type Bundle, type Currency, type Cycle } from '@/billing/plans';

/** The biggest combo saving, for the headline (worked out from the prices, never typed in). */
const maxSaving = Math.max(...BUNDLES.map((b) => bundleSavingPct(b.id)));

export function PricingClient() {
  const [cycle, setCycle] = useState<Cycle>('yearly');
  const [bundle, setBundle] = useState<Bundle>('factory');
  const [currency, setCurrency] = useState<Currency>('INR');
  return (
    <main className="b-public">
      <header className="b-public-head">
        <div className="o-row" style={{ gap: 10 }}>
          <div className="o-brand-mark" aria-hidden />
          <strong style={{ color: '#fff', fontSize: 18 }}>Orbit</strong>
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
        <h1>Sales, purchasing, production and quality for project companies</h1>
        <p>Take one portal, or combine them and save up to {maxSaving}%. Pay monthly, quarterly, half-yearly or yearly. Try everything free for {TRIAL_DAYS} days.</p>
      </section>
      <div className="b-public-body">
        <div className="b-steps" style={{ alignItems: 'center' }}>
          <span className="b-step">Where is your company?</span>
          <div className="b-cycle" role="group" aria-label="Currency">
            <button type="button" aria-pressed={currency === 'INR'} onClick={() => setCurrency('INR')}>
              India (₹)
            </button>
            <button type="button" aria-pressed={currency === 'USD'} onClick={() => setCurrency('USD')}>
              Outside India ($)
            </button>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>{taxNote(currency)}</span>
        </div>
        <div className="b-steps">
          <span className="b-step">1. Choose portals</span>
          <BundlePicker bundle={bundle} onChange={setBundle} currency={currency} />
        </div>
        <div className="b-steps" style={{ alignItems: 'center' }}>
          <span className="b-step">2. How often to pay</span>
          <CycleSwitch cycle={cycle} onChange={setCycle} />
        </div>
        <PlanCards
          bundle={bundle}
          cycle={cycle}
          currency={currency}
          action={(tier) => (
            <Link className={`o-btn block${TIERS.find((t) => t.id === tier)?.popular ? ' primary' : ''}`} href="/auth/login?hint=sign-up">
              Start {TRIAL_DAYS}-day free trial
            </Link>
          )}
          enterprise={
            <a className="o-btn block" href="mailto:sales@metalyxtech.com?subject=Orbit%20Enterprise">
              Talk to us
            </a>
          }
        />
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
