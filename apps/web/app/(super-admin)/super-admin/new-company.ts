import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from '@orbit/core';
import { companies, memberships, users, withTenant, type Db } from '@orbit/db';
import { saveBillingSettings } from '@/billing/admin';
import { TRIAL_DAYS } from '@/billing/plans';
import { portalModules } from '@/portals';
import { setPortal } from './guard';

// Super Admin > Add company: Orbit's team sets up a client who contacted them.
// The company starts active, its admin can sign in with the email given, and billing is set per country.

export const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'Australia/Perth', 'UTC'];

export const newCompanyInput = z.object({
  name: z.string().trim().min(2, 'Company name is too short').max(120),
  country: z.enum(['india', 'abroad']),
  timezone: z.enum(TIMEZONES as [string, ...string[]]),
  stage: z.enum(['sandbox', 'pilot', 'live']),
  adminName: z.string().trim().min(2, 'Enter the admin’s name').max(120),
  adminEmail: z.email('Enter a valid admin email').transform((e) => e.trim().toLowerCase()),
  adminTitle: z.string().trim().max(100).optional(),
  portals: z.array(z.string()).min(1, 'Choose at least one portal'),
  trialDays: z.coerce.number().int().min(0).max(90).default(TRIAL_DAYS),
  showPlans: z.boolean(),
});
export type NewCompanyInput = z.input<typeof newCompanyInput>;

/** Reads the Add company form. */
export function readNewCompanyForm(form: FormData): NewCompanyInput {
  const v = (k: string) => String(form.get(k) ?? '');
  return {
    name: v('name'),
    country: v('country') === 'abroad' ? 'abroad' : 'india',
    timezone: v('timezone'),
    stage: (v('stage') || 'live') as 'live',
    adminName: v('adminName'),
    adminEmail: v('adminEmail'),
    adminTitle: v('adminTitle') || undefined,
    portals: form.getAll('portals').map(String),
    trialDays: v('trialDays') || TRIAL_DAYS,
    showPlans: v('showPlans') !== 'hide',
  };
}

/** Creates the company, its admin (signs in with that email), its portals and billing settings. Returns the company id. */
export async function createCompany(db: Db, superUserId: string, raw: NewCompanyInput) {
  const input = newCompanyInput.parse(raw);
  const portals = [...new Set(input.portals)].filter((p) => portalModules[p]);
  if (!portals.length) throw new Error('Choose at least one portal');
  const [dupe] = await db.select({ id: companies.id }).from(companies).where(sql`lower(btrim(${companies.name})) = lower(${input.name})`).limit(1);
  if (dupe) throw new Error(`A company called ${input.name} already exists`);
  const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;
  const domain = input.adminEmail.split('@')[1];
  const [company] = await db
    .insert(companies)
    .values({ name: input.name, slug, timezone: input.timezone, stage: input.stage, status: 'active', emailDomains: domain ? [domain] : [] })
    .returning({ id: companies.id });
  await withTenant(db, { companyId: company.id, userId: superUserId }, async (tx) => {
    // Same as a company admin adding a person: the account is linked when they first sign in with this email.
    await tx.insert(users).values({ workosUserId: `invited|${input.adminEmail}`, email: input.adminEmail, name: input.adminName }).onConflictDoNothing({ target: users.email });
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.adminEmail));
    const [m] = await tx
      .insert(memberships)
      .values({ companyId: company.id, userId: user.id, role: 'company_admin', title: input.adminTitle || 'Company admin', status: 'active' })
      .returning({ id: memberships.id });
    for (const p of portals) await setPortal(tx, company.id, p, true);
    await saveBillingSettings(tx, company.id, { currency: input.country === 'abroad' ? 'USD' : 'INR', showPlans: input.showPlans, trialDays: input.trialDays });
    await audit(tx, {
      companyId: company.id,
      actorId: null,
      action: 'company.create',
      entity: 'companies',
      entityId: company.id,
      data: { summary: [`Company set up by Orbit with admin ${input.adminEmail}`], portals, admin: m.id, currency: input.country === 'abroad' ? 'USD' : 'INR' },
    });
  });
  return company.id;
}
