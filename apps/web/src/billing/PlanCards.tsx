'use client';
import { useEffect, useState, type ReactNode } from 'react';
import {
  CYCLES,
  FREE_VIEWERS,
  MIN_SEATS,
  SEAT_PRICE,
  PAIR_PORTALS,
  TRIAL_DAYS,
  bundleDesc,
  bundleForPortals,
  bundleName,
  bundleOf,
  bundlesIn,
  cycleOf,
  groupFrom,
  groupMaxSaving,
  isCombo,
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

/** The four ways to buy, in the order the picker shows them. */
type Kind = 'single' | 'pair' | 'suite' | 'people';
const KINDS: { id: Kind; tag: string; title: string }[] = [
  { id: 'single', tag: 'Fix one problem', title: 'One portal' },
  { id: 'pair', tag: 'Connect two teams', title: 'Two portals' },
  { id: 'suite', tag: 'Run the whole factory', title: 'Full suite' },
  { id: 'people', tag: 'Your people', title: 'HR + Timesheet' },
];
/** What each kind selects when it is first clicked. */
const FIRST: Record<Kind, Bundle> = { single: 'production', pair: 'production_quality', suite: 'factory', people: 'hr_timesheet' };
const kindOf = (b: Bundle): Kind | null => {
  const g = bundleOf(b)?.group;
  return g && g !== 'legacy' ? g : null;
};

/**
 * Step 1: which portals. First the kind of plan (one portal, two portals, a full suite, or
 * HR + Timesheet), then which portal or portals.
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
  const kind = kindOf(bundle);
  // Two-portal plans: the portals ticked so far (the plan changes once two are ticked).
  const [picked, setPicked] = useState<string[]>(kind === 'pair' ? bundleOf(bundle)!.portals : []);
  useEffect(() => {
    if (kindOf(bundle) === 'pair') setPicked(bundleOf(bundle)!.portals);
  }, [bundle]);

  const chooseKind = (k: Kind) => {
    if (k === kind) return;
    const b = FIRST[k];
    if (k === 'pair') setPicked(bundleOf(b)!.portals);
    onChange(b);
  };
  const togglePair = (portal: string) => {
    const next = picked.includes(portal) ? picked.filter((p) => p !== portal) : [...picked, portal].slice(-2);
    setPicked(next);
    const b = next.length === 2 ? bundleForPortals(next) : undefined;
    if (b) onChange(b);
  };

  const kindPrice = (k: Kind) => groupFrom(k, currency);
  const kindSaving = (k: Kind) => (k === 'single' ? 0 : groupMaxSaving(k, currency));
  const suiteName = bundleName('factory', companyType);

  const tile = (b: Bundle, opts: { check?: boolean; on: boolean; onClick: () => void; price?: boolean }) => (
    <button
      key={b}
      type="button"
      role={opts.check ? 'checkbox' : 'radio'}
      aria-checked={opts.on}
      className={`b-bundle${opts.on ? ' on' : ''}`}
      onClick={opts.onClick}
    >
      <span className={opts.check ? 'b-check' : 'b-radio'} aria-hidden />
      <span>
        <strong>
          {bundleName(b, companyType)}
          {bundleOf(b)?.best && (
            <span className="b-save" style={{ marginLeft: 6, whiteSpace: 'nowrap', display: 'inline-block' }}>
              Best value
            </span>
          )}
        </strong>
        <small>{bundleDesc(b, companyType)}</small>
      </span>
      {opts.price !== false && (
        <em>
          {m(SEAT_PRICE[b][currency])}/person
          {isCombo(b) && seatSavingPct(b, currency) > 0 && <span className="b-save" style={{ marginLeft: 6 }}>Save {seatSavingPct(b, currency)}%</span>}
        </em>
      )}
    </button>
  );

  const legacy = !kind ? bundleOf(bundle) : undefined;
  return (
    <div className="b-pick">
      {legacy && (
        <p className="b-legacy">
          Your plan, <strong>{legacy.name}</strong>, is no longer offered to new companies. You can stay on it, or choose one of the plans below.
        </p>
      )}
      <div className="b-kinds" role="radiogroup" aria-label="Type of plan">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={`b-kind${kind === k.id ? ' on' : ''}`} onClick={() => chooseKind(k.id)}>
            {k.id === 'suite' && <span className="b-ribbon">Best value</span>}
            <span className="b-kind-tag">{k.tag}</span>
            <strong>{k.id === 'suite' ? `${suiteName} or Complete` : k.title}</strong>
            <span className="b-kind-price">
              {k.id === 'people' ? '' : 'from '}
              {m(kindPrice(k.id))}
              <small> /person/month</small>
            </span>
            {kindSaving(k.id) > 0 ? <span className="b-save">Save up to {kindSaving(k.id)}%</span> : <span className="b-save b-save-quiet">Any one of 6 portals</span>}
          </button>
        ))}
      </div>
      {kind && (
        <div className="b-pick-detail">
          {kind === 'single' && (
            <>
              <p className="b-pick-q">Which portal?</p>
              <div className="b-bundles" role="radiogroup" aria-label="Which portal">
                {bundlesIn('single').map((b) => tile(b.id, { on: bundle === b.id, onClick: () => onChange(b.id) }))}
              </div>
            </>
          )}
          {kind === 'pair' && (
            <>
              <p className="b-pick-q">
                Which two portals? <span>{picked.length === 2 ? 'Tick another to swap' : `Tick ${2 - picked.length} more`}</span>
              </p>
              <div className="b-bundles" role="group" aria-label="Which two portals">
                {PAIR_PORTALS.map((p) => {
                  const single = bundleForPortals([p])!;
                  return (
                    <button
                      key={p}
                      type="button"
                      role="checkbox"
                      aria-checked={picked.includes(p)}
                      className={`b-bundle${picked.includes(p) ? ' on' : ''}`}
                      onClick={() => togglePair(p)}
                    >
                      <span className="b-check" aria-hidden />
                      <span>
                        <strong>{bundleName(single, companyType)}</strong>
                        <small>{bundleDesc(single, companyType)}</small>
                      </span>
                      <em style={{ color: 'var(--ink-3)' }}>{m(SEAT_PRICE[single][currency])} alone</em>
                    </button>
                  );
                })}
              </div>
              {picked.length === 2 && kind === 'pair' && (
                <p className="b-note">
                  <strong>{bundleName(bundle, companyType)}</strong>: {m(SEAT_PRICE[bundle][currency])} per person instead of <s>{m(seatSeparately(bundle, currency))}</s>, save{' '}
                  {seatSavingPct(bundle, currency)}%. {bundleDesc(bundle, companyType)}.
                </p>
              )}
              <p className="b-note">Need HR too? Choose HR + Timesheet, or Complete suite + HR.</p>
            </>
          )}
          {kind === 'suite' && (
            <>
              <p className="b-pick-q">Which suite?</p>
              <div className="b-bundles" role="radiogroup" aria-label="Which suite">
                {bundlesIn('suite').map((b) => tile(b.id, { on: bundle === b.id, onClick: () => onChange(b.id) }))}
              </div>
            </>
          )}
          {kind === 'people' && (
            <>
              <p className="b-pick-q">HR and Timesheet together</p>
              <div className="b-bundles">{bundlesIn('people').map((b) => tile(b.id, { on: bundle === b.id, onClick: () => onChange(b.id) }))}</div>
              <p className="b-note">HR builds attendance from the hours people book, and leave approved in HR shows on timesheets and the roster. Want just one of them? Choose One portal.</p>
            </>
          )}
        </div>
      )}
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
