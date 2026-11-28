import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@orbit/core/next';
import { billingEvents, withTenant } from '@orbit/db';
import { applySeatAddonEvent } from '@/billing/extra-seats';
import { adoptPaidCheckout, applyRazorpay } from '@/billing/state';
import { verifyWebhookSignature, type RzSubscription } from '@/billing/razorpay';

export const dynamic = 'force-dynamic';

const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Razorpay webhook (subscription.* and payment events). Configure in the Razorpay dashboard:
 * URL <app>/api/webhooks/razorpay, secret = SSM /orbit/<stage>/app/razorpayWebhookSecret.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!(await verifyWebhookSignature(raw, req.headers.get('x-razorpay-signature')))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const evt = JSON.parse(raw) as {
    event: string;
    payload: { subscription?: { entity: RzSubscription }; payment?: { entity: { id: string; amount: number; currency?: string; status: string } } };
  };
  const sub = evt.payload.subscription?.entity;
  const companyId = sub?.notes?.company_id;
  if (!sub || !companyId || !UUID.test(companyId)) return NextResponse.json({ ok: true, ignored: true });
  const db = await getDb();
  await withTenant(db, { companyId, userId: SYSTEM_USER }, async (tx) => {
    // Extra seats are their own subscriptions; everything else is the company's main subscription.
    if (sub.notes?.kind === 'seats') await applySeatAddonEvent(tx, companyId, sub);
    else {
      await applyRazorpay(tx, companyId, sub);
      // Paid, but the customer closed the window before coming back: finish the switch here.
      await adoptPaidCheckout(tx, companyId, sub, evt.payload.payment?.entity.id ?? null);
    }
    const pay = evt.payload.payment?.entity;
    await tx.insert(billingEvents).values({
      companyId,
      type: evt.event,
      razorpayId: pay?.id ?? sub.id,
      amount: pay?.amount ?? null,
      data: { status: sub.status, current_end: sub.current_end, currency: pay?.currency ?? sub.notes?.currency ?? null },
    });
  });
  return NextResponse.json({ ok: true });
}
