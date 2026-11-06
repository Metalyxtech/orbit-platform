'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Chip, ConfirmDialog, DataTable, EmptyState, useToast } from '@orbit/ui';
import { BundlePicker, CycleSwitch, PlanCards, TRUST } from '@/billing/PlanCards';
import { cycleOf, inr, planOf, priceFor, tierOf, type Bundle, type Cycle, type TierId } from '@/billing/plans';
import type { BillingState } from '@/billing/state';
import { cancelPlanAction, confirmCheckoutAction, startCheckoutAction } from './actions';

type History = { id: string; type: string; amount: number | null; ref: string | null; at: string };
type RzResponse = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string };
declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, fn: (r: { error?: { description?: string } }) => void) => void };
  }
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const EVENT: Record<string, string> = {
  'checkout.started': 'Checkout started',
  'checkout.completed': 'Payment confirmed',
  'subscription.activated': 'Subscription active',
  'subscription.charged': 'Payment received',
  'subscription.pending': 'Payment pending (retrying)',
  'subscription.halted': 'Payments failed, subscription paused',
  'subscription.cancelled': 'Subscription cancelled',
  'subscription.cancel_requested': 'Cancellation requested',
  'subscription.completed': 'Subscription completed',
  'payment.failed': 'Payment failed',
};

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function BillingClient({ state, company, history }: { state: BillingState; company: string; history: History[] }) {
  const router = useRouter();
  const toast = useToast();
  const [cycle, setCycle] = useState<Cycle>((state.cycle as Cycle | null) ?? 'yearly');
  const used = state.usage.portals;
  const [bundle, setBundle] = useState<Bundle>(
    (state.bundle as Bundle | null) ?? (used.includes('timesheet') && used.includes('procurement') ? 'both' : used.includes('procurement') ? 'purchase' : used.includes('timesheet') ? 'timesheet' : 'both'),
  );
  const [pick, setPick] = useState<TierId | null>(null);
  const [cancel, setCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = state.plan ? planOf(state.plan) : undefined;
  const paid = state.status === 'active' || state.status === 'past_due';

  async function pay(tier: TierId) {
    setPick(null);
    setBusy(true);
    const res = await startCheckoutAction({ bundle, tier, cycle });
    if (!res.ok) {
      setBusy(false);
      return toast(res.error, 'bad');
    }
    if (!(await loadCheckout()) || !window.Razorpay) {
      setBusy(false);
      return toast('Could not open Razorpay. Check your connection and try again.', 'bad');
    }
    const rz = new window.Razorpay({
      key: res.data.keyId,
      subscription_id: res.data.subscriptionId,
      name: 'Orbit',
      description: `${res.data.planName}, ${res.data.cycle}`,
      prefill: { name: res.data.name, email: res.data.email },
      notes: { company },
      theme: { color: '#2f5d8a' },
      modal: { ondismiss: () => setBusy(false) },
      handler: async (r: RzResponse) => {
        const done = await confirmCheckoutAction({ paymentId: r.razorpay_payment_id, subscriptionId: r.razorpay_subscription_id, signature: r.razorpay_signature });
        setBusy(false);
        if (!done.ok) return toast(done.error, 'bad');
        toast(`You are on ${res.data.planName}. Thank you!`);
        router.refresh();
      },
    });
    rz.on('payment.failed', (e) => {
      setBusy(false);
      toast(e.error?.description ?? 'The payment failed. Nothing was charged.', 'bad');
    });
    rz.open();
  }

  async function doCancel() {
    setCancel(false);
    setBusy(true);
    const res = await cancelPlanAction();
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad');
    toast('Your plan will end at the end of the paid period.');
    router.refresh();
  }

  const statusChip = {
    trial: <Chip tone="steel">{state.trialDaysLeft} days left</Chip>,
    trial_ended: <Chip tone="bad">Trial ended</Chip>,
    active: <Chip tone="ok">Active</Chip>,
    past_due: <Chip tone="warn">Payment due</Chip>,
    cancelled: <Chip tone="bad">Cancelled</Chip>,
    pending_payment: <Chip tone="warn">Waiting for payment</Chip>,
  }[state.status];

  const bar = (used: number, cap: number) => (cap >= 99 ? 'All' : `${used} of ${cap}`);

  return (
    <div className="o-page">
      <div className="o-page-head">
        <div>
          <h1>Plan and billing</h1>
          <p>Choose the plan for {company}. Payments are handled securely by Razorpay.</p>
        </div>
      </div>

      <div className="b-current o-panel">
        <div>
          <div className="o-row" style={{ gap: 8 }}>
            <h2 style={{ margin: 0 }}>{current && paid ? `${current.name} plan` : state.status === 'trial' ? 'Free trial' : 'No active plan'}</h2>
            {statusChip}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
            {state.status === 'trial' && `${state.trialDaysLeft} days left, until ${date(state.trialEndsAt)}. Both portals for up to ${state.limits.users} people are included. Pick a plan any time; you are charged only when the trial ends.`}
            {state.status === 'trial_ended' && 'Your free trial has ended. Choose a plan to keep adding people and portals.'}
            {state.status === 'pending_payment' && 'Checkout was started but not paid. Choose the plan again to pay.'}
            {state.status === 'active' &&
              (state.cancelAtPeriodEnd
                ? `${current?.name}, ${cycleOf(state.cycle ?? 'monthly').label.toLowerCase()}. Ends on ${date(state.currentPeriodEnd)}; it will not renew.`
                : `${current?.name}, ${cycleOf(state.cycle ?? 'monthly').label.toLowerCase()}, ${current ? inr(priceFor(current.bundle, current.tier, (state.cycle as Cycle) ?? 'monthly')) : ''} + GST. Renews on ${date(state.currentPeriodEnd)}.`)}
            {state.status === 'past_due' && 'Razorpay could not take the last payment and is retrying. Update your payment method from the link Razorpay emailed you.'}
            {state.status === 'cancelled' && 'Your subscription has ended. Choose a plan to continue.'}
          </p>
        </div>
        <div className="b-usage">
          <div>
            <span>People</span>
            <strong>{bar(state.usage.users, state.limits.users)}</strong>
            {state.limits.users < 99 && <i style={{ width: `${Math.min(100, (state.usage.users / state.limits.users) * 100)}%` }} />}
          </div>
          <div>
            <span>Portals</span>
            <strong>{state.limits.portals.map((p) => (p === 'procurement' ? 'Purchase' : 'Timesheet')).join(' + ')}</strong>
          </div>
        </div>
      </div>

      <h2 style={{ margin: '8px 0 0' }}>{paid ? 'Change plan' : 'Choose your plan'}</h2>
      <div className="b-steps">
        <span className="b-step">1. Portals</span>
        <BundlePicker bundle={bundle} onChange={setBundle} />
      </div>
      <div className="b-steps">
        <span className="b-step">2. How often to pay</span>
        <CycleSwitch cycle={cycle} onChange={setCycle} />
      </div>
      <div className="b-steps">
        <span className="b-step">3. Team size</span>
        <PlanCards
          bundle={bundle}
          cycle={cycle}
          action={(tier) => {
            const t = tierOf(tier)!;
            const id = `${bundle}_${tier}`;
            return paid && !state.cancelAtPeriodEnd && state.plan === id && state.cycle === cycle ? (
              <Button block disabled>
                Current plan
              </Button>
            ) : (
              <Button block variant={t.popular ? 'primary' : undefined} disabled={busy || state.usage.users > t.users} onClick={() => setPick(tier)}>
                {state.usage.users > t.users ? `Over ${t.users} people` : paid ? `Switch to ${t.name}` : `Choose ${t.name}`}
              </Button>
            );
          }}
          enterprise={
            <a className="o-btn block" href="mailto:sales@metalyxtech.com?subject=Orbit%20Enterprise">
              Talk to us
            </a>
          }
        />
      </div>
      <ul className="b-trust">
        {TRUST.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <div className="o-panel flush">
        <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
          <h2>Billing history</h2>
          {paid && !state.cancelAtPeriodEnd && (
            <Button size="small" onClick={() => setCancel(true)}>
              Cancel subscription
            </Button>
          )}
        </div>
        <DataTable
          rows={history}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No payments yet." />}
          columns={[
            { key: 'd', header: 'Date', render: (r) => date(r.at) },
            { key: 't', header: 'Event', render: (r) => EVENT[r.type] ?? r.type },
            { key: 'a', header: 'Amount', num: true, render: (r) => (r.amount ? inr(r.amount / 100) : '-') },
            { key: 'r', header: 'Reference', render: (r) => <span className="faint" style={{ fontSize: 11 }}>{r.ref}</span> },
          ]}
        />
      </div>

      <ConfirmDialog
        open={!!pick}
        title={pick ? `${planOf(`${bundle}_${pick}`)?.name}, ${cycleOf(cycle).label.toLowerCase()}` : ''}
        confirmLabel="Continue to payment"
        onCancel={() => setPick(null)}
        onConfirm={() => pick && void pay(pick)}
      >
        {pick && (
          <>
            {inr(priceFor(bundle, pick, cycle))} + GST per {cycleOf(cycle).per}, for up to {tierOf(pick)?.users} people.
            {state.status === 'trial' && state.trialDaysLeft > 0 ? ` Your card or UPI is set up now; the first charge is on ${date(state.trialEndsAt)} when the trial ends.` : ' You pay now through Razorpay.'}{' '}
            Cancel any time.
          </>
        )}
      </ConfirmDialog>
      <ConfirmDialog open={cancel} title="Cancel your subscription?" variant="danger" confirmLabel="Cancel at period end" cancelLabel="Keep my plan" onCancel={() => setCancel(false)} onConfirm={doCancel}>
        Your plan stays active until {date(state.currentPeriodEnd)} and will not renew. Your data stays safe; you can subscribe again any time.
      </ConfirmDialog>
    </div>
  );
}
