'use client';
import type { ReactNode } from 'react';
import {
  BUNDLES,
  BUNDLE_GROUPS,
  CYCLES,
  FREE_VIEWERS,
  MIN_SEATS,
  SEAT_PRICE,
  TRIAL_DAYS,
  bundleOf,
  cycleOf,
  isCombo,
  money,
  roundMoney,
  seatQuote,
  seatSavingPct,
  seatSeparately,
  taxNote,
  type Bundle,
  type Currency,
  type Cycle,
} from './plans';

/** Step 1: which portals. One portal, or a combination at a lower price per person. */
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
            <em>
              {m(SEAT_PRICE[b.id][currency])}/person
              {isCombo(b.id) && <span className="b-save" style={{ marginLeft: 6 }}>Save {seatSavingPct(b.id, currency)}%</span>}
            </em>
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

/**
 * Step 3: the bill, worked out for the number of people. `onSeats` makes the number editable
 * (public pricing page); without it the number is the company's own and fixed.
 */
export function SeatCalculator({
  bundle,
  cycle,
  currency,
  seats,
  onSeats,
  minSeats = 1,
  peopleNote,
  action,
}: {
  bundle: Bundle;
  cycle: Cycle;
  currency: Currency;
  seats: number;
  onSeats?: (n: number) => void;
  /** Fewest seats that can be chosen (the company's people today). */
  minSeats?: number;
  peopleNote?: ReactNode;
  action: ReactNode;
}) {
  const q = seatQuote(bundle, seats, cycle, currency);
  const c = cycleOf(cycle);
  const m = (v: number) => money(v, currency);
  const b = bundleOf(bundle)!;
  return (
    <div className="b-calc">
      <article className="b-plan popular">
        <h3>{b.name}</h3>
        <p className="b-tag">{b.desc}</p>
        <div className="b-price">
          <strong>{m(SEAT_PRICE[bundle][currency])}</strong>
          <span>per person / month</span>
        </div>
        {isCombo(bundle) && (
          <p className="b-combo">
            <s>{m(seatSeparately(bundle, currency))}</s> if bought separately · save {seatSavingPct(bundle, currency)}%
          </p>
        )}
        <div className="b-seats">
          <label className="o-field" style={{ margin: 0 }}>
            Number of seats (people)
            {onSeats ? (
              <input
                className="o-input"
                type="number"
                inputMode="numeric"
                min={minSeats}
                max={100000}
                value={seats}
                onChange={(e) => onSeats(Math.max(1, Math.min(100000, Math.floor(Number(e.target.value) || 1))))}
              />
            ) : (
              <strong style={{ fontSize: 22 }}>{q.seats}</strong>
            )}
          </label>
          {peopleNote && <p className="faint" style={{ fontSize: 12, margin: '6px 0 0' }}>{peopleNote}</p>}
          {seats < MIN_SEATS && (
            <p className="faint" style={{ fontSize: 12, margin: '6px 0 0' }}>
              The smallest plan is {MIN_SEATS} people.
            </p>
          )}
        </div>
      </article>
      <div className="o-panel b-bill" aria-live="polite">
        <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Your price</h3>
        <table className="b-lines">
          <tbody>
            {q.lines.map((l) => (
              <tr key={l.label}>
                <td>
                  {l.label}
                  <div className="faint" style={{ fontSize: 11 }}>
                    {l.people} × {m(l.each)}
                  </div>
                </td>
                <td>{m(l.amount)}</td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Per month</strong>
              </td>
              <td>
                <strong>{m(q.perMonth)}</strong>
              </td>
            </tr>
            {c.months > 1 && (
              <>
                <tr>
                  <td>
                    {c.label}: {c.months} months
                  </td>
                  <td>{m(roundMoney(q.perMonth * c.months, currency))}</td>
                </tr>
                <tr className="b-good">
                  <td>{c.badge ?? 'Discount'}</td>
                  <td>−{m(q.saving)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
        <div className="b-total">
          <span>You pay</span>
          <strong>{m(q.total)}</strong>
          <span>
            per {c.per} · {taxNote(currency)}
          </span>
        </div>
        {c.months > 1 && <p className="faint" style={{ fontSize: 12, margin: '4px 0 0' }}>That is {m(roundMoney(q.total / c.months / q.seats, currency))} per person per month.</p>}
        <div className="b-cta" style={{ marginTop: 14 }}>
          {action}
        </div>
      </div>
    </div>
  );
}

/** How per-user billing works, shown under the calculator. */
export const seatRules = (currency: Currency) => [
  `Buy a seat for each person who uses SteelConnect360 (at least ${MIN_SEATS})`,
  `${FREE_VIEWERS} management viewers free: your GM and a director can view, hold and comment at no cost`,
  'Bigger teams pay less: 15% off seats 26 to 100, 25% off from the 101st',
  'Someone leaves? Their seat stays yours: give it to someone else at no extra cost',
  'Need more? Buy extra seats any time: pay only for the rest of the current period, then they renew with your plan',
  `Prices in ${currency === 'INR' ? 'rupees' : currency === 'GBP' ? 'pounds' : 'US dollars'}`,
];

/** Reassurance list under the plans; payment methods and tax differ for India and abroad. */
export const trustFor = (currency: Currency = 'INR', trialDays = TRIAL_DAYS) => [
  `${trialDays}-day free trial, no card needed`,
  'Pay monthly, quarterly, half-yearly or yearly',
  currency === 'INR' ? 'UPI, cards, net banking and UPI AutoPay through Razorpay' : `International cards through Razorpay, charged in ${currency === 'GBP' ? 'pounds' : 'US dollars'}`,
  'Change plan or cancel any time',
  currency === 'INR' ? 'GST invoice every cycle' : currency === 'GBP' ? 'VAT invoice every cycle' : 'Invoice every cycle',
];
export const TRUST = trustFor();
