'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CycleSwitch, PlanCards, TRUST } from '@/billing/PlanCards';
import { TRIAL_DAYS, type Cycle } from '@/billing/plans';

export function PricingClient() {
  const [cycle, setCycle] = useState<Cycle>('yearly');
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
        <p>Approvals that follow your company, dashboards for management, one place for every portal. Try everything free for {TRIAL_DAYS} days.</p>
        <CycleSwitch cycle={cycle} onChange={setCycle} />
      </section>
      <div className="b-public-body">
        <PlanCards
          cycle={cycle}
          action={(p) => (
            <Link className={`o-btn block${p.popular ? ' primary' : ''}`} href="/auth/login?hint=sign-up">
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
