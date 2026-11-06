'use client';
import type { ReactNode } from 'react';
import { BUNDLES, CYCLES, MONTHLY, TIERS, TRIAL_DAYS, bundleSaving, cycleOf, inr, perMonthFor, priceFor, savingFor, type Bundle, type Cycle, type TierId } from './plans';

/** Step 1: which portals. */
export function BundlePicker({ bundle, onChange }: { bundle: Bundle; onChange: (b: Bundle) => void }) {
  return (
    <div className="b-bundles" role="radiogroup" aria-label="Portals">
      {BUNDLES.map((b) => (
        <button key={b.id} type="button" role="radio" aria-checked={bundle === b.id} className={`b-bundle${bundle === b.id ? ' on' : ''}`} onClick={() => onChange(b.id)}>
          <span className="b-radio" aria-hidden />
          <span>
            <strong>{b.name}</strong>
            <small>{b.desc}</small>
          </span>
          <em>{b.id === 'both' ? `Save ${inr(bundleSaving('growth'))}/mo` : `from ${inr(MONTHLY[b.id].starter)}/mo`}</em>
        </button>
      ))}
    </div>
  );
}

/** Step 2: how often to pay. */
export function CycleSwitch({ cycle, onChange }: { cycle: Cycle; onChange: (c: Cycle) => void }) {
  return (
    <div className="b-cycle" role="group" aria-label="Billing cycle">
      {CYCLES.map((c) => (
        <button key={c.id} type="button" aria-pressed={cycle === c.id} onClick={() => onChange(c.id)}>
          {c.label}
          {c.badge && <span className="b-save">{c.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Step 3: team size, priced for the chosen portals and cycle. */
export function PlanCards({
  bundle,
  cycle,
  action,
  enterprise,
}: {
  bundle: Bundle;
  cycle: Cycle;
  action: (tier: TierId) => ReactNode;
  enterprise: ReactNode;
}) {
  const c = cycleOf(cycle);
  return (
    <div className="b-plans">
      {TIERS.map((t) => (
        <article key={t.id} className={`b-plan${t.popular ? ' popular' : ''}`}>
          {t.popular && <span className="b-ribbon">Most popular</span>}
          <h3>{t.name}</h3>
          <p className="b-tag">{t.tagline}</p>
          <div className="b-price">
            <strong>{inr(perMonthFor(bundle, t.id, cycle))}</strong>
            <span>/ month</span>
          </div>
          <p className="b-billed">
            {c.months === 1 ? 'Billed monthly · GST extra' : `${inr(priceFor(bundle, t.id, cycle))} per ${c.per} · save ${inr(savingFor(bundle, t.id, cycle))}`}
          </p>
          {bundle === 'both' && (
            <p className="b-combo">
              {inr(MONTHLY.timesheet[t.id] + MONTHLY.purchase[t.id])} separately · you save {inr(bundleSaving(t.id))}/mo
            </p>
          )}
          <ul>
            {t.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <div className="b-cta">{action(t.id)}</div>
        </article>
      ))}
      <article className="b-plan enterprise">
        <h3>Enterprise</h3>
        <p className="b-tag">For groups with many companies or 150+ people</p>
        <div className="b-price">
          <strong>Custom</strong>
        </div>
        <p className="b-billed">Volume pricing, invoicing and bank transfer</p>
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

export const TRUST = [
  `${TRIAL_DAYS}-day free trial, no card needed`,
  'Pay monthly, quarterly, half-yearly or yearly',
  'UPI, cards, net banking and UPI AutoPay through Razorpay',
  'Change plan or cancel any time',
  'GST invoice every cycle',
];
