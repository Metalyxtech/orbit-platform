'use client';
import type { ReactNode } from 'react';
import { inr, perMonth, PLANS, priceOf, yearlySaving, type Cycle, type Plan } from './plans';

/** Monthly / yearly switch shown above the plan cards. */
export function CycleSwitch({ cycle, onChange }: { cycle: Cycle; onChange: (c: Cycle) => void }) {
  return (
    <div className="b-cycle" role="group" aria-label="Billing cycle">
      <button type="button" aria-pressed={cycle === 'monthly'} onClick={() => onChange('monthly')}>
        Monthly
      </button>
      <button type="button" aria-pressed={cycle === 'yearly'} onClick={() => onChange('yearly')}>
        Yearly <span className="b-save">2 months free</span>
      </button>
    </div>
  );
}

/** The plan cards: used on Plan and billing (company admin) and on the public pricing page. */
export function PlanCards({ cycle, action, enterprise }: { cycle: Cycle; action: (p: Plan) => ReactNode; enterprise: ReactNode }) {
  return (
    <div className="b-plans">
      {PLANS.map((p) => (
        <article key={p.id} className={`b-plan${p.popular ? ' popular' : ''}`}>
          {p.popular && <span className="b-ribbon">Most popular</span>}
          <h3>{p.name}</h3>
          <p className="b-tag">{p.tagline}</p>
          <div className="b-price">
            <strong>{inr(perMonth(p, cycle))}</strong>
            <span>/ month</span>
          </div>
          <p className="b-billed">
            {cycle === 'yearly' ? (
              <>
                {inr(priceOf(p, cycle))} billed yearly · save {inr(yearlySaving(p))}
              </>
            ) : (
              'Billed monthly · GST extra'
            )}
          </p>
          <ul>
            {p.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <div className="b-cta">{action(p)}</div>
        </article>
      ))}
      <article className="b-plan enterprise">
        <h3>Enterprise</h3>
        <p className="b-tag">For groups with many companies or 150+ people</p>
        <div className="b-price">
          <strong>Custom</strong>
        </div>
        <p className="b-billed">Volume pricing and invoicing</p>
        <ul>
          <li>Unlimited people and portals</li>
          <li>Several companies under one account</li>
          <li>Custom forms and workflows set up for you</li>
          <li>Named account manager and SLA</li>
        </ul>
        <div className="b-cta">{enterprise}</div>
      </article>
    </div>
  );
}

export const TRUST = ['30-day free trial, no card needed', 'Cancel any time', 'GST invoice every cycle', 'Pay by UPI, card or net banking through Razorpay'];
