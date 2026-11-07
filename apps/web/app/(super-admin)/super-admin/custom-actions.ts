'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@orbit/core';
import { getDb } from '@orbit/core/next';
import { withTenant } from '@orbit/db';
import { saveCustomPlan } from '@/custom/plan';
import { updateRequest } from '@/custom/requests';
import { requireSuperAdmin } from './guard';

/** Company page > Custom work: make the company a custom customer and set its price. */
export async function saveCustomPlanAction(companyId: string, form: FormData) {
  const userId = await requireSuperAdmin();
  const id = z.uuid().parse(companyId);
  const db = await getDb();
  await withTenant(db, { companyId: id, userId }, async (tx) => {
    const v = await saveCustomPlan(tx, id, {
      enabled: form.get('enabled') === 'on',
      label: String(form.get('label') ?? 'Custom plan'),
      monthlyPrice: String(form.get('monthlyPrice') ?? ''),
      yearlyPrice: String(form.get('yearlyPrice') ?? ''),
      maxUsers: String(form.get('maxUsers') ?? ''),
      note: String(form.get('note') ?? ''),
    });
    await audit(tx, {
      companyId: id,
      actorId: null,
      action: 'custom.plan',
      entity: 'custom_plans',
      entityId: id,
      data: { summary: [`Custom work ${v.enabled ? 'on' : 'off'}: ${v.label}, monthly ${v.monthlyPrice ?? '-'}, yearly ${v.yearlyPrice ?? '-'}`] },
    });
  });
  revalidatePath('/super-admin', 'layout');
}

/** Custom work > one request: status and Orbit's reply to the customer. */
export async function updateCustomRequestAction(companyId: string, requestId: string, form: FormData) {
  const userId = await requireSuperAdmin();
  const id = z.uuid().parse(companyId);
  const db = await getDb();
  await withTenant(db, { companyId: id, userId }, (tx) =>
    updateRequest(tx, id, { id: requestId, status: String(form.get('status') ?? 'new') as 'new', orbitNote: String(form.get('orbitNote') ?? '') }),
  );
  revalidatePath('/super-admin', 'layout');
}
