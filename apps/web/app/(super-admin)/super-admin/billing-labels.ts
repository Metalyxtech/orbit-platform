import type { BillingStatus } from '@/billing/state';

// Words and chip colours for subscription states on the Super Admin pages.

export const STATUS_LABEL: Record<BillingStatus, { label: string; tone: string }> = {
  trial: { label: 'Free trial', tone: '' },
  trial_ended: { label: 'Free period ended', tone: 'bad' },
  active: { label: 'Paid', tone: 'ok' },
  past_due: { label: 'Payment due', tone: 'warn' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
  pending_payment: { label: 'Checkout not paid', tone: 'warn' },
};

export const EVENT_LABEL: Record<string, string> = {
  'checkout.started': 'Checkout started',
  'checkout.completed': 'Subscription confirmed',
  'subscription.activated': 'Subscription active',
  'subscription.charged': 'Payment received',
  'subscription.pending': 'Payment pending',
  'subscription.halted': 'Payments failed',
  'subscription.cancelled': 'Cancelled',
  'subscription.cancel_requested': 'Cancel requested',
  'subscription.completed': 'Completed',
  'payment.failed': 'Payment failed',
  'seats.changed': 'Number of people changed (from the next bill)',
  'seats.needs_confirmation': 'New number of people waiting for the admin to confirm',
  'seats.sync_failed': 'Number of people not sent to Razorpay (check)',
};
