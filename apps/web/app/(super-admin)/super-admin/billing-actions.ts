'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@orbit/core';
import { getDb } from '@orbit/core/next';
import { withTenant } from '@orbit/db';
import { extendFreePeriod, markPaymentsSeen, saveBillingSettings } from '@/billing/admin';
import { billingSettings } from '@/billing/state';
import { requireSuperAdmin } from './guard';
import { createCompany, readNewCompanyForm } from './new-company';

/** Super Admin > Add company. Errors come back on the form's URL. */
export async function createCompanyAction(form: FormData) {
  const userId = await requireSuperAdmin();
  const db = await getDb();
  let id: string;
  try {
    id = await createCompany(db, userId, readNewCompanyForm(form));
  } catch (err) {
    const msg = err instanceof z.ZodError ? (err.issues[0]?.message ?? 'Check the form') : err instanceof Error && !('code' in err) ? err.message : 'Could not add the company. Try again.';
    redirect(`/super-admin/companies/new?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath('/super-admin', 'layout');
  redirect(`/super-admin/companies/${id}?added=1`);
}

/** Company page > Billing: currency (India ₹ / abroad $), plans released or hidden, trial days. */
export async function setCompanyBillingAction(companyId: string, form: FormData) {
  const userId = await requireSuperAdmin();
  const id = z.uuid().parse(companyId);
  const db = await getDb();
  await withTenant(db, { companyId: id, userId }, async (tx) => {
    const s = await saveBillingSettings(tx, id, {
      currency: form.get('currency') === 'USD' ? 'USD' : 'INR',
      showPlans: form.get('showPlans') !== 'hide',
      trialDays: Number(form.get('trialDays') ?? 7),
    });
    await audit(tx, {
      companyId: id,
      actorId: null,
      action: 'billing.settings',
      entity: 'company_billing',
      entityId: id,
      data: { summary: [`Billing set by SteelConnect360: ${s.currency}, plans ${s.showPlans ? 'released' : 'hidden'}, ${s.trialDays}-day trial`] },
    });
  });
  revalidatePath('/super-admin', 'layout');
}

/** Release or hide the plans in one click (Subscriptions page). */
export async function setPlansShownAction(companyId: string, showPlans: boolean) {
  const userId = await requireSuperAdmin();
  const id = z.uuid().parse(companyId);
  const db = await getDb();
  await withTenant(db, { companyId: id, userId }, async (tx) => {
    const cur = await billingSettings(tx, id);
    await saveBillingSettings(tx, id, { ...cur, showPlans });
    await audit(tx, { companyId: id, actorId: null, action: 'billing.settings', entity: 'company_billing', entityId: id, data: { summary: [`Plans ${showPlans ? 'released' : 'hidden'} by SteelConnect360`] } });
  });
  revalidatePath('/super-admin', 'layout');
}

/** Payment confirmations for these companies have been seen; the badge clears. */
export async function markPaymentsSeenAction(companyIds: string[]) {
  const userId = await requireSuperAdmin();
  const ids = z.array(z.uuid()).max(500).parse(companyIds);
  const db = await getDb();
  for (const id of ids) await withTenant(db, { companyId: id, userId }, (tx) => markPaymentsSeen(tx, id));
  revalidatePath('/super-admin', 'layout');
}

/** Gives a company more free days (from today if its free period has already ended). */
export async function extendFreePeriodAction(companyId: string, days: number | FormData) {
  const userId = await requireSuperAdmin();
  const id = z.uuid().parse(companyId);
  const n = z.coerce.number().int().min(1).max(365).parse(days instanceof FormData ? days.get('days') : days);
  const db = await getDb();
  await withTenant(db, { companyId: id, userId }, async (tx) => {
    const end = await extendFreePeriod(tx, id, n);
    await audit(tx, {
      companyId: id,
      actorId: null,
      action: 'billing.free_period',
      entity: 'company_billing',
      entityId: id,
      data: { summary: [`Free period extended by ${n} days by SteelConnect360, now until ${end.toISOString().slice(0, 10)}`] },
    });
  });
  revalidatePath('/super-admin', 'layout');
}
