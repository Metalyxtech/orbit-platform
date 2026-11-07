'use client';
import { useState } from 'react';
import { money } from '@/billing/plans';
import type { SubscriptionSnapshot } from '@/custom/quotes';

type Quote = { label: string | null; monthly: number | null; yearly: number | null; credit: number; note: string | null; quotedAt: string | null; approved: boolean | null; decidedAt: string | null };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

/**
 * Super Admin > Custom work > request: what the company pays now, and the price to send them.
 * One combined price (their normal portals + the custom portal). A yearly plan already paid for
 * gives a credit for the days not used, taken off the first yearly payment.
 */
export function QuotePanel({ snap, quote, company, action }: { snap: SubscriptionSnapshot; quote: Quote; company: string; action: (form: FormData) => Promise<void> }) {
  const cur = snap.currency;
  const m = (v: number) => money(v, cur);
  const [yearly, setYearly] = useState(quote.yearly ? String(quote.yearly) : '');
  const [monthly, setMonthly] = useState(quote.monthly ? String(quote.monthly) : '');
  const [credit, setCredit] = useState(String(quote.quotedAt ? quote.credit : snap.unused));
  const y = Number(yearly) || 0;
  const c = Math.min(Number(credit) || 0, y);
  return (
    <div className="o-panel">
      <div className="o-panel-head">
        <h2>Price for {company}</h2>
        {quote.approved === true && <span className="o-chip ok">Approved {day(quote.decidedAt)}</span>}
        {quote.approved === false && <span className="o-chip bad">Declined {day(quote.decidedAt)}</span>}
        {quote.quotedAt && quote.approved == null && <span className="o-chip hivis">Sent {day(quote.quotedAt)}</span>}
      </div>

      <div className="o-banner info" style={{ fontSize: 13 }}>
        {snap.paid && snap.price ? (
          <>
            <strong>Now:</strong> {snap.planName}, {snap.cycleLabel?.toLowerCase()}, {m(snap.price)}. Paid {day(snap.periodStart)} to {day(snap.periodEnd)}: {snap.daysUsed} days used,{' '}
            {snap.daysLeft} left.{' '}
            {snap.monthly ? (
              <>Monthly: it simply runs on until the custom plan starts. No credit needed.</>
            ) : (
              <>
                Unused value: <strong>{m(snap.unused)}</strong> (suggested credit).
              </>
            )}
          </>
        ) : snap.status === 'trial' ? (
          <>
            <strong>Now:</strong> free trial. Nothing paid yet, so no credit.
          </>
        ) : (
          <>
            <strong>Now:</strong> no active paid plan. No credit.
          </>
        )}
      </div>

      <form action={action} className="o-stack" style={{ gap: 10, marginTop: 10 }}>
        <label className="o-field">
          Plan name the customer sees
          <input className="o-input" name="label" required defaultValue={quote.label ?? `${company} plan with custom portal`} maxLength={120} />
        </label>
        <div className="o-row" style={{ gap: 10 }}>
          <label className="o-field" style={{ flex: 1 }}>
            Monthly price ({cur === 'USD' ? '$' : '₹'})
            <input className="o-input" name="monthly" type="number" min={1} value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="Not offered" />
          </label>
          <label className="o-field" style={{ flex: 1 }}>
            Yearly price ({cur === 'USD' ? '$' : '₹'})
            <input className="o-input" name="yearly" type="number" min={1} value={yearly} onChange={(e) => setYearly(e.target.value)} placeholder="Not offered" />
          </label>
        </div>
        <label className="o-field">
          Credit off the first yearly payment ({cur === 'USD' ? '$' : '₹'})
          <input className="o-input" name="credit" type="number" min={0} value={credit} onChange={(e) => setCredit(e.target.value)} />
        </label>
        <div className="o-panel" style={{ margin: 0, background: 'var(--steel-tint)', fontSize: 13 }}>
          {y > 0 && (
            <div>
              Yearly: first payment <strong>{m(y - c)}</strong>
              {c > 0 && ` (${m(y)} − ${m(c)} credit)`}, then {m(y)} every year.
            </div>
          )}
          {Number(monthly) > 0 && <div>Monthly: {m(Number(monthly))} every month{snap.paid && snap.periodEnd ? `, starting when their paid period ends (${day(snap.periodEnd)})` : ''}.</div>}
          {!y && !Number(monthly) && <div className="faint">Enter a monthly and/or yearly price.</div>}
          <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>
            Prices cover everything they use: their normal portals plus the custom portal{cur === 'INR' ? '; GST extra' : ''}.
          </div>
        </div>
        <label className="o-field">
          Note to the customer (what is included, delivery time)
          <textarea className="o-input" name="note" rows={3} maxLength={2000} defaultValue={quote.note ?? ''} />
        </label>
        <button className="o-btn small primary" type="submit" style={{ alignSelf: 'flex-start' }}>
          {quote.quotedAt ? 'Send updated price' : 'Send price to customer'}
        </button>
      </form>
      <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
        After they approve, set the status to Being built. When you set it to Ready, this price becomes their custom plan and they subscribe in Plan and billing.
      </p>
    </div>
  );
}
