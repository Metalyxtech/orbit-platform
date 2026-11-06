import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSecret } from '@orbit/core/aws';

// Small Razorpay REST client (subscriptions). RAZORPAY_API_BASE lets tests point at a mock server.
const base = () => process.env.RAZORPAY_API_BASE ?? 'https://api.razorpay.com/v1';

export class PaymentsNotConfigured extends Error {
  constructor() {
    super('Online payments are not set up yet. Orbit will switch them on shortly.');
  }
}

async function keys() {
  try {
    // Trim: a key pasted with a space or line break is otherwise rejected by Razorpay.
    return { id: (await getSecret('razorpayKeyId')).trim(), secret: (await getSecret('razorpayKeySecret')).trim() };
  } catch {
    throw new PaymentsNotConfigured();
  }
}

export async function publicKeyId() {
  return (await keys()).id;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const k = await keys();
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${k.id}:${k.secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) {
    console.error(JSON.stringify({ razorpay: path, status: res.status, error: data.error }));
    if (res.status === 401) throw new Error('Razorpay did not accept Orbit’s payment keys. Orbit is fixing this; please try again later.');
    throw new Error(data.error?.description ? `Payment provider: ${data.error.description}` : 'The payment provider did not respond. Try again in a minute.');
  }
  return data;
}

export interface RzSubscription {
  id: string;
  plan_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  charge_at: number | null;
  short_url?: string;
  notes?: Record<string, string>;
}

export const createPlan = (input: { period: 'monthly' | 'yearly'; interval: number; name: string; amount: number; currency: 'INR' | 'USD'; description: string }) =>
  call<{ id: string }>('POST', '/plans', {
    period: input.period,
    interval: input.interval,
    item: { name: input.name, amount: input.amount, currency: input.currency, description: input.description },
  });

export const createSubscription = (input: { planId: string; totalCount: number; notes: Record<string, string>; startAt?: number }) =>
  call<RzSubscription>('POST', '/subscriptions', {
    plan_id: input.planId,
    total_count: input.totalCount,
    quantity: 1,
    customer_notify: 1,
    notes: input.notes,
    ...(input.startAt ? { start_at: input.startAt } : {}),
  });

export const fetchSubscription = (id: string) => call<RzSubscription>('GET', `/subscriptions/${encodeURIComponent(id)}`);

export const cancelSubscription = (id: string, atCycleEnd: boolean) =>
  call<RzSubscription>('POST', `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });

const sameHex = (a: string, b: string) => {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

/** Checkout success: signature = HMAC_SHA256(payment_id + "|" + subscription_id, key_secret). */
export async function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string) {
  const { secret } = await keys();
  const expected = createHmac('sha256', secret).update(`${paymentId}|${subscriptionId}`).digest('hex');
  return /^[0-9a-f]+$/i.test(signature) && sameHex(expected, signature);
}

/** Webhooks: X-Razorpay-Signature = HMAC_SHA256(raw body, webhook secret). */
export async function verifyWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature || !/^[0-9a-f]+$/i.test(signature)) return false;
  let secret: string;
  try {
    secret = (await getSecret('razorpayWebhookSecret')).trim();
  } catch {
    return false;
  }
  return sameHex(createHmac('sha256', secret).update(rawBody).digest('hex'), signature);
}
