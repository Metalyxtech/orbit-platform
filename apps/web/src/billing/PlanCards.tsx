'use client';
import { useEffect, useState, type ReactNode } from 'react';
import {
  CYCLES,
  FREE_VIEWERS,
  MIN_SEATS,
  SEAT_PRICE,
  TRIAL_DAYS,
  bundleDesc,
  bestBundleFor,
  bundleName,
  bundleOf,
  bundlesIn,
  cycleOf,
  groupFrom,
  isCombo,
  MIX_DISCOUNT,
  seatPrice,
  suiteCovering,
  money,
  roundMoney,
  seatQuote,
  seatSavingPct,
  seatSeparately,
  taxNote,
  type Bundle,
  type CompanyType,
  type Currency,
  type Cycle,
} from './plans';

/** The ways to buy, laid out like the sales deck: three cards and a people band. */
type Kind = 'single' | 'multi' | 'suite' | 'people';
const JOB_PORTALS = ['sales', 'procurement', 'production', 'quality'];
const ALL_PORTALS = [...JOB_PORTALS, 'timesheet', 'hr'];
const PEOPLE: Bundle[] = ['timesheet', 'hr', 'hr_timesheet'];
const kindOf = (b: Bundle): Kind => {
  if (PEOPLE.includes(b)) return 'people';
  const g = bundleOf(b)?.group;
  return g === 'single' ? 'single' : g === 'suite' ? 'suite' : 'multi';
};
const label = (p: string) => (p === 'procurement' ? 'Purchase' : p === 'hr' ? 'HR' : p.charAt(0).toUpperCase() + p.slice(1));

/**
 * Step 1: the plan. Three cards (one portal, any portals you pick, a full suite) and a band for
 * the people portals (Timesheet, HR, or both). Each card remembers its own choice.
 */
export function BundlePicker({
  bundle,
  onChange,
  currency = 'INR',
  companyType = 'manufacturing',
}: {
  bundle: Bundle;
  onChange: (b: Bundle) => void;
  currency?: Currency;
  companyType?: CompanyType;
}) {
  const m = (v: number) => money(v, currency);
  const price = (b: Bundle) => seatPrice(b, currency);
  const perDay = (v: number) => money(roundMoney(v / 30, currency), currency);
  const kind = kindOf(bundle);
  const info = bundleOf(bundle);

  // Each card's own choice, so moving between cards brings it back.
  const [single, setSingle] = useState<Bundle>(kind === 'single' ? bundle : 'production');
  const [picked, setPicked] = useState<string[]>(kind === 'multi' && info ? info.portals : ['production', 'quality']);
  const [suite, setSuite] = useState<Bundle>(kind === 'suite' ? bundle : 'factory');
  const [people, setPeople] = useState<Bundle>(kind === 'people' ? bundle : 'hr_timesheet');
  useEffect(() => {
    const k = kindOf(bundle);
    if (k === 'single') setSingle(bundle);
    if (k === 'multi') setPicked(bundleOf(bundle)?.portals ?? []);
    if (k === 'suite') setSuite(bundle);
    if (k === 'people') setPeople(bundle);
  }, [bundle]);

  const multiBundle = picked.length >= 2 ? bestBundleFor(picked) : null;
  const togglePortal = (p: string) => {
    const next = picked.includes(p) ? picked.filter((x) => x !== p) : [...picked, p];
    setPicked(next);
    if (next.length >= 2) onChange(bestBundleFor(next));
  };
  const multiPrice = kind === 'multi' && multiBundle ? price(multiBundle) : groupFrom('pair', currency);
  // A suite that covers the chosen portals for about the same money is worth pointing out.
  const tip = multiBundle && kind === 'multi' ? suiteCovering(picked, currency, multiPrice * 1.15) : undefined;

  const singlePrice = kind === 'single' ? price(bundle) : Math.min(...JOB_PORTALS.map((p) => price(bestBundleFor([p]))));
  const legacy = info?.group === 'legacy';

  const head = (k: Kind, body: ReactNode) => (
    <button type="button" role="radio" aria-checked={kind === k} className="b-tier-head" onClick={() => onChange(k === 'single' ? single : k === 'suite' ? suite : k === 'people' ? people : (multiBundle ?? bestBundleFor(['production', 'quality'])))}>
      {body}
    </button>
  );
  const chip = (key: string, text: ReactNode, on: boolean, onClick: () => void, check = false) => (
    <button key={key} type="button" role={check ? 'checkbox' : 'radio'} aria-checked={on} className={`b-chip${on ? ' on' : ''}`} onClick={onClick}>
      <span className={check ? 'b-check' : 'b-radio'} aria-hidden />
      {text}
    </button>
  );

  return (
    <div className="b-pick">
      {legacy && info && (
        <p className="b-legacy">
          Your plan, <strong>{info.name}</strong>, is no longer offered to new companies. You can stay on it, or choose one of the plans below.
        </p>
      )}
      <div className="b-tiers" role="radiogroup" aria-label="Type of plan">
        <div className={`b-tier${kind === 'single' ? ' on' : ''}`}>
          {head(
            'single',
            <>
              <span className="b-tier-tag">Start</span>
              <strong className="b-tier-title">Fix one problem</strong>
              <span className="b-tier-amount">{m(singlePrice)}</span>
              <span className="b-tier-per">{kind === 'single' ? 'per person per month' : 'from, per person per month'}</span>
              <span className="b-pill">About {perDay(singlePrice)} a day</span>
            </>,
          )}
          <div className="b-tier-body">
            <p className="b-tier-q">Pick any one portal</p>
            <div className="b-chips" role="radiogroup" aria-label="Which portal">
              {JOB_PORTALS.map((p) => {
                const b = bestBundleFor([p]);
                return chip(
                  p,
                  <>
                    {label(p)} <em>{m(price(b))}</em>
                  </>,
                  kind === 'single' && bundle === b,
                  () => onChange(b),
                );
              })}
            </div>
          </div>
        </div>

        <div className={`b-tier${kind === 'multi' ? ' on' : ''}`}>
          {head(
            'multi',
            <>
              <span className="b-tier-tag">Grow</span>
              <strong className="b-tier-title">Connect your teams</strong>
              <span className="b-tier-amount">{m(multiPrice)}</span>
              <span className="b-tier-per">{kind === 'multi' && multiBundle ? 'per person per month' : 'from, per person per month'}</span>
              <span className="b-pill">
                {kind === 'multi' && multiBundle && seatSavingPct(multiBundle, currency) > 0
                  ? `Save ${seatSavingPct(multiBundle, currency)}% on ${picked.length} portals`
                  : `Save up to ${Math.round(MIX_DISCOUNT(4) * 100)}%`}
              </span>
            </>,
          )}
          <div className="b-tier-body">
            <p className="b-tier-q">
              Pick any portals <span>{picked.length < 2 ? `tick ${2 - picked.length} more` : `${picked.length} chosen`}</span>
            </p>
            <div className="b-chips" role="group" aria-label="Which portals">
              {ALL_PORTALS.map((p) => chip(p, <>{label(p)} <em>{m(price(bestBundleFor([p])))}</em></>, picked.includes(p), () => togglePortal(p), true))}
            </div>
            {kind === 'multi' && multiBundle && (
              <p className="b-note">
                {bundleName(multiBundle, companyType)}: <strong>{m(price(multiBundle))}</strong> instead of <s>{m(seatSeparately(multiBundle, currency))}</s>
              </p>
            )}
            {tip && (
              <button type="button" className="b-tip" onClick={() => onChange(tip)}>
                Tip: the {bundleName(tip, companyType)} has all of these and more for {m(price(tip))}. Switch to it
              </button>
            )}
          </div>
        </div>

        <div className={`b-tier dark${kind === 'suite' ? ' on' : ''}`}>
          <span className="b-tier-badge">Most popular</span>
          {head(
            'suite',
            <>
              <span className="b-tier-tag">Run the factory</span>
              <strong className="b-tier-title">{bundleName(kind === 'suite' ? bundle : 'factory', companyType)}</strong>
              <span className="b-tier-amount">{m(price(kind === 'suite' ? bundle : 'factory'))}</span>
              <span className="b-tier-per">per person per month · {perDay(price(kind === 'suite' ? bundle : 'factory'))} a day</span>
              <span className="b-pill">Save {seatSavingPct(kind === 'suite' ? bundle : 'factory', currency)}% against buying separately</span>
            </>,
          )}
          <div className="b-tier-body">
            <p className="b-tier-q">Choose your suite</p>
            <div className="b-chips col" role="radiogroup" aria-label="Which suite">
              {bundlesIn('suite').map((b) =>
                chip(
                  b.id,
                  <>
                    <span className="b-chip-main">
                      {bundleName(b.id, companyType)}
                      <small>{b.id === 'factory' ? 'Sales, Purchase, Production, Quality' : b.id === 'complete' ? '+ Timesheet' : '+ Timesheet and HR'}</small>
                    </span>
                    <em>{m(price(b.id))}</em>
                  </>,
                  kind === 'suite' && bundle === b.id,
                  () => onChange(b.id),
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={`b-people${kind === 'people' ? ' on' : ''}`} role="radiogroup" aria-label="People portals">
        <span className="b-people-tag">People</span>
        <span className="b-people-text">Only need Timesheet or HR?</span>
        <div className="b-chips">
          {PEOPLE.map((b) =>
            chip(
              b,
              <>
                {bundleName(b, companyType)} <em>{m(price(b))}</em>
                {seatSavingPct(b, currency) > 0 && <span className="b-save">save {seatSavingPct(b, currency)}%</span>}
              </>,
              kind === 'people' && bundle === b,
              () => onChange(b),
            ),
          )}
        </div>
      </div>
      <div className="b-strip">
        <span className="hi">Works alongside Tally or your ERP</span>
        <span>GM + 1 director free</span>
        <span>2 months free on yearly</span>
        <span>{taxNote(currency)}</span>
      </div>
    </div>
  );
}

/** Company type on the public pricing page: it names the suite (Manufacturing or Production). */
export function CompanyTypeSwitch({ value, onChange }: { value: CompanyType; onChange: (t: CompanyType) => void }) {
  const types: { id: CompanyType; label: string }[] = [
    { id: 'manufacturing', label: 'Manufacturing: fabrication, piping, projects' },
    { id: 'production', label: 'Production: machining, moulding, press tools' },
  ];
  return (
    <div className="b-cycle" role="group" aria-label="Company type">
      {types.map((t) => (
        <button key={t.id} type="button" aria-pressed={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}
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
  companyType = 'manufacturing',
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
  companyType?: CompanyType;
}) {
  const q = seatQuote(bundle, seats, cycle, currency);
  const c = cycleOf(cycle);
  const m = (v: number) => money(v, currency);
  return (
    <div className="b-calc">
      <article className="b-plan popular">
        <h3>{bundleName(bundle, companyType)}</h3>
        <p className="b-tag">{bundleDesc(bundle, companyType)}</p>
        <div className="b-price">
          <strong>{m(seatPrice(bundle, currency))}</strong>
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
