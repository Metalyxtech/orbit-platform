'use client';
import type { ReactNode } from 'react';
import { BUNDLES, BUNDLE_GROUPS, CYCLES, TIERS, TRIAL_DAYS, bundleSaving, bundleSavingPct, cycleOf, isCombo, separatelyFor, money, monthly, perMonthFor, priceFor, savingFor, taxNote, type Bundle, type Currency, type Cycle, type TierId } from './plans';

/** Step 1: which portals. One portal, or a combination at a lower price. */
export function BundlePicker({ bundle, onChange, currency = 'INR' }: { bundle: Bundle; onChange: (b: Bundle) => void; currency?: Currency }) {
  const m = (v: number) => money(v, currency);
  const group = (title: string, list: typeof BUNDLES) => (
    <div className="o-stack" style={{ gap: 6 }}>
      <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
        {title}
      </span>
      <div className="b-bundles" role="radiogroup" aria-label={title}>
        {list.map((b) => (
          <button key={b.id} type="button" role="radio" aria-checked={bundle === b.id} className={`b-bundle${bundle === b.id ? ' on' : ''}`} onClick={() => onChange(b.id)}>
            <span className="b-radio" aria-hidden />
            <span>
              <strong>
                {b.name}
                {b.best && (
                  <span className="b-save" style={{ marginLeft: 6, whiteSpace: 'nowrap', display: 'inline-block' }}>
                    Best value
                  </span>
                )}
              </strong>
              <small>{b.desc}</small>
            </span>
            <em>{isCombo(b.id) ? `Save ${bundleSavingPct(b.id)}%` : `from ${m(monthly(b.id, 'starter', currency))}/mo`}</em>
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="o-stack" style={{ gap: 12, flex: 1 }}>
      {BUNDLE_GROUPS.map((g) => (
        <div key={g.id}>{group(g.title, BUNDLES.filter((b) => b.group === g.id))}</div>
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
  currency = 'INR',
}: {
  bundle: Bundle;
  cycle: Cycle;
  currency?: Currency;
  action: (tier: TierId) => ReactNode;
  enterprise: ReactNode;
}) {
  const c = cycleOf(cycle);
  const m = (v: number) => money(v, currency);
  return (
    <div className="b-plans">
      {TIERS.map((t) => (
        <article key={t.id} className={`b-plan${t.popular ? ' popular' : ''}`}>
          {t.popular && <span className="b-ribbon">Most popular</span>}
          <h3>{t.name}</h3>
          <p className="b-tag">{t.tagline}</p>
          <div className="b-price">
            <strong>{m(perMonthFor(bundle, t.id, cycle, currency))}</strong>
            <span>/ month</span>
          </div>
          <p className="b-billed">
            {c.months === 1 ? `Billed monthly · ${taxNote(currency)}` : `${m(priceFor(bundle, t.id, cycle, currency))} per ${c.per} · save ${m(savingFor(bundle, t.id, cycle, currency))}`}
          </p>
          {isCombo(bundle) && (
            <p className="b-combo">
              <s>{m(separatelyFor(bundle, t.id, currency))}</s> separately · you save {m(bundleSaving(t.id, currency, bundle))}/mo ({bundleSavingPct(bundle, t.id)}%)
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

/** Reassurance list under the plans; payment methods and tax differ for India and abroad. */
export const trustFor = (currency: Currency = 'INR', trialDays = TRIAL_DAYS) => [
  `${trialDays}-day free trial, no card needed`,
  'Pay monthly, quarterly, half-yearly or yearly',
  currency === 'USD' ? 'International cards through Razorpay, charged in US dollars' : 'UPI, cards, net banking and UPI AutoPay through Razorpay',
  'Change plan or cancel any time',
  currency === 'USD' ? 'Invoice every cycle' : 'GST invoice every cycle',
];
export const TRUST = trustFor();
