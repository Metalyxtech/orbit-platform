'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ConfirmDialog, useToast } from '@orbit/ui';
import { installmentOf, money, type Currency } from '@/billing/plans';
import { decideQuoteAction } from './actions';

type Quote = { label: string; monthly: number | null; yearly: number | null; credit: number; installments: boolean; note: string | null; approved: boolean | null; decidedAt: string | null };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

/** Orbit's price for a custom request, with Approve / Decline for the company admin. */
export function QuoteBox({ requestId, quote, currency, waiting }: { requestId: string; quote: Quote; currency: Currency; waiting: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [ask, setAsk] = useState<'approve' | 'decline' | null>(null);
  const [busy, setBusy] = useState(false);
  const m = (v: number) => money(v, currency);
  const tax = currency === 'INR' ? ' + GST' : '';
  const first = quote.yearly ? Math.max(0, quote.yearly - quote.credit) : 0;

  async function decide(approve: boolean) {
    setAsk(null);
    setBusy(true);
    const res = await decideQuoteAction({ id: requestId, approve });
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast(approve ? 'Approved. Orbit starts the work and lets you know when it is ready.' : 'Declined. Orbit will get back to you.');
    router.refresh();
  }

  return (
    <div className="o-panel" style={{ margin: '10px 0 0', background: 'var(--steel-tint)' }}>
      <strong style={{ fontSize: 13 }}>Price from Orbit: {quote.label}</strong>
      <ul style={{ margin: '6px 0', paddingLeft: 18, fontSize: 13 }}>
        {quote.yearly && (
          <li>
            Yearly: {m(quote.yearly)}
            {tax} per year
            {quote.credit > 0 && (
              <>
                {' '}
                · first payment <strong>{m(first)}</strong> after a {m(quote.credit)} credit for the unused part of your current yearly plan
              </>
            )}
          </li>
        )}
        {quote.yearly && quote.installments && (
          <li>
            Or the yearly price paid monthly: {m(installmentOf(quote.yearly))}
            {tax} × 12 months (12-month term)
          </li>
        )}
        {quote.monthly && (
          <li>
            Monthly: {m(quote.monthly)}
            {tax} per month
          </li>
        )}
      </ul>
      <p className="faint" style={{ fontSize: 12, margin: 0 }}>
        Covers your current portals plus the custom portal. You subscribe in Plan and billing once Orbit has built it; until then your current plan carries on.
      </p>
      {quote.note && <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{quote.note}</p>}
      {waiting ? (
        <div className="o-row" style={{ gap: 8, marginTop: 10 }}>
          <Button variant="primary" disabled={busy} onClick={() => setAsk('approve')}>
            Approve price
          </Button>
          <Button disabled={busy} onClick={() => setAsk('decline')}>
            Decline
          </Button>
        </div>
      ) : (
        quote.approved != null && (
          <p style={{ fontSize: 12, margin: '8px 0 0' }}>
            <span className={`o-chip ${quote.approved ? 'ok' : 'bad'}`}>{quote.approved ? 'You approved' : 'You declined'}</span> {day(quote.decidedAt)}
          </p>
        )
      )}
      <ConfirmDialog
        open={!!ask}
        title={ask === 'approve' ? `Approve ${quote.label}?` : 'Decline this price?'}
        confirmLabel={ask === 'approve' ? 'Approve' : 'Decline'}
        variant={ask === 'decline' ? 'danger' : undefined}
        onCancel={() => setAsk(null)}
        onConfirm={() => void decide(ask === 'approve')}
      >
        {ask === 'approve'
          ? 'Orbit starts building your custom portal. Nothing is charged now: you subscribe in Plan and billing when it is ready.'
          : 'Orbit will be told you did not accept this price, and can send a new one.'}
      </ConfirmDialog>
    </div>
  );
}
