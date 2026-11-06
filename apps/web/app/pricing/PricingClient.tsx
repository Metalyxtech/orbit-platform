'use client';
import Link from 'next/link';
import { useState } from 'react';
import { BundlePicker, CycleSwitch, PlanCards, TRUST } from '@/billing/PlanCards';
import { TIERS, TRIAL_DAYS, type Bundle, type Cycle } from '@/billing/plans';

export function PricingClient() {
  const [cycle, setCycle] = useState<Cycle>('yearly');
  const [bundle, setBundle] = useState<Bundle>('both');
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
        <h1>Timesheets and purchasing for site and project teams</h1>
        <p>Take one portal or both. Pay monthly, quarterly, half-yearly or yearly. Try everything free for {TRIAL_DAYS} days.</p>
      </section>
      <div className="b-public-body">
        <div className="b-steps">
          <span className="b-step">1. Choose portals</span>
          <BundlePicker bundle={bundle} onChange={setBundle} />
        </div>
        <div className="b-steps" style={{ alignItems: 'center' }}>
          <span className="b-step">2. How often to pay</span>
          <CycleSwitch cycle={cycle} onChange={setCycle} />
        </div>
        <PlanCards
          bundle={bundle}
          cycle={cycle}
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
          {TRUST.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
