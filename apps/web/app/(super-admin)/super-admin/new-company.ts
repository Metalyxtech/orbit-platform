import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { audit, isIndustry, setCompanyIndustry, type Industry } from '@orbit/core';
import { companies, memberships, users, withTenant, type Db, type Tx } from '@orbit/db';
import { saveBillingSettings } from '@/billing/admin';
import { TRIAL_DAYS } from '@/billing/plans';
import { INDUSTRY_PORTALS } from '@/industry-portals';
import { setPortal } from './guard';

// Super Admin > Add company: SteelConnect360's team sets up a client who contacted them.
// The company starts active, its admin can sign in with the email given, and billing is set per country.

/** Which currency a company pays in, by country. */
const COUNTRY_CURRENCY = { india: 'INR', uk: 'GBP', abroad: 'USD' } as const;

export const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'Australia/Perth', 'UTC'];

export const newCompanyInput = z.object({
  name: z.string().trim().min(2, 'Company name is too short').max(120),
  /** Manufacturing (fabrication, projects) or Production (machining, moulding, press tool). */
  industry: z.enum(['manufacturing', 'production']).default('manufacturing'),
  country: z.enum(['india', 'uk', 'abroad']),
  timezone: z.enum(TIMEZONES as [string, ...string[]]),
  stage: z.enum(['sandbox', 'pilot', 'live']),
  adminName: z.string().trim().min(2, 'Enter the admin’s name').max(120),
  adminEmail: z.email('Enter a valid admin email').transform((e) => e.trim().toLowerCase()),
  adminTitle: z.string().trim().max(100).optional(),
  /** Optional second company admin, with exactly the same access as the first. */
  admin2Name: z.string().trim().max(120).optional(),
  admin2Email: z.string().trim().toLowerCase().optional(),
  admin2Title: z.string().trim().max(100).optional(),
  portals: z.array(z.string()),
  /** Only a custom portal: no Timesheet or Purchase. */
  customOnly: z.boolean().default(false),
  trialDays: z.coerce.number().int().min(0).max(90).default(TRIAL_DAYS),
  showPlans: z.boolean(),
});
export type NewCompanyInput = z.input<typeof newCompanyInput>;

/** Reads the Add company form. */
export function readNewCompanyForm(form: FormData): NewCompanyInput {
  const v = (k: string) => String(form.get(k) ?? '');
  return {
    name: v('name'),
    industry: (isIndustry(v('industry')) ? v('industry') : 'manufacturing') as Industry,
    country: v('country') === 'abroad' ? 'abroad' : v('country') === 'uk' ? 'uk' : 'india',
    timezone: v('timezone'),
    stage: (v('stage') || 'live') as 'live',
    adminName: v('adminName'),
    adminEmail: v('adminEmail'),
    adminTitle: v('adminTitle') || undefined,
    admin2Name: v('admin2Name') || undefined,
    admin2Email: v('admin2Email') || undefined,
    admin2Title: v('admin2Title') || undefined,
    portals: form.getAll('portals').map(String),
    customOnly: form.get('customOnly') === 'on',
    trialDays: v('trialDays') || TRIAL_DAYS,
    showPlans: v('showPlans') !== 'hide',
  };
}

/** Creates the company, its admin (signs in with that email), its portals and billing settings. Returns the company id. */
export async function createCompany(db: Db, superUserId: string, raw: NewCompanyInput) {
  const input = newCompanyInput.parse(raw);
  const second = input.admin2Name || input.admin2Email ? adminInput.parse({ name: input.admin2Name ?? '', email: input.admin2Email ?? '', title: input.admin2Title }) : null;
  if (second && second.email === input.adminEmail) throw new Error('The second admin needs a different email from the first');
  // Only the company type's own portals can be switched on.
  const portals = input.customOnly ? [] : [...new Set(input.portals)].filter((p) => INDUSTRY_PORTALS[input.industry].includes(p));
  if (!portals.length && !input.customOnly) throw new Error('Choose at least one portal, or Custom portal only');
  const [dupe] = await db.select({ id: companies.id }).from(companies).where(sql`lower(btrim(${companies.name})) = lower(${input.name})`).limit(1);
  if (dupe) throw new Error(`A company called ${input.name} already exists`);
  const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;
  const domain = input.adminEmail.split('@')[1];
  const [company] = await db
    .insert(companies)
    .values({ name: input.name, slug, timezone: input.timezone, stage: input.stage, status: 'active', emailDomains: domain ? [domain] : [] })
    .returning({ id: companies.id });
  await withTenant(db, { companyId: company.id, userId: superUserId }, async (tx) => {
    await setCompanyIndustry(tx, company.id, input.industry);
    // Same as a company admin adding a person: the account is linked when they first sign in with this email.
    await tx.insert(users).values({ workosUserId: `invited|${input.adminEmail}`, email: input.adminEmail, name: input.adminName }).onConflictDoNothing({ target: users.email });
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.adminEmail));
    const [m] = await tx
      .insert(memberships)
      .values({ companyId: company.id, userId: user.id, role: 'company_admin', title: input.adminTitle || 'Company admin', status: 'active' })
      .returning({ id: memberships.id });
    const m2 = second ? await addCompanyAdmin(tx, company.id, second) : null;
    for (const p of portals) await setPortal(tx, company.id, p, true);
    await saveBillingSettings(tx, company.id, { currency: COUNTRY_CURRENCY[input.country], showPlans: input.showPlans, trialDays: input.trialDays });
    await audit(tx, {
      companyId: company.id,
      actorId: null,
      action: 'company.create',
      entity: 'companies',
      entityId: company.id,
      data: {
        summary: [`Company set up by SteelConnect360 with admin ${second ? `${input.adminEmail} and ${second.email}` : input.adminEmail}`],
        portals,
        admin: m.id,
        ...(m2 ? { admin2: m2 } : {}), currency: COUNTRY_CURRENCY[input.country] },
    });
  });
  return company.id;
}

/** A company can have at most this many company admins; each has the same, full access. */
export const MAX_COMPANY_ADMINS = 2;

export const adminInput = z.object({
  name: z.string().trim().min(2, 'Enter the admin’s name').max(120),
  email: z.email('Enter a valid admin email').transform((e) => e.trim().toLowerCase()),
  title: z.string().trim().max(100).optional(),
});
export type AdminInput = z.input<typeof adminInput>;

/**
 * Makes someone a company admin (same access as every other company admin). A new email gets an
 * account that is linked when they first sign in; someone already in the company is promoted.
 * Refuses when the company already has MAX_COMPANY_ADMINS. Runs inside the company's RLS scope.
 * Returns the membership id.
 */
export async function addCompanyAdmin(tx: Tx, companyId: string, raw: AdminInput) {
  const input = adminInput.parse(raw);
  await tx.insert(users).values({ workosUserId: `invited|${input.email}`, email: input.email, name: input.name }).onConflictDoNothing({ target: users.email });
  const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email));
  const [existing] = await tx
    .select({ id: memberships.id, role: memberships.role, status: memberships.status })
    .from(memberships)
    .where(and(eq(memberships.companyId, companyId), eq(memberships.userId, user.id)));
  if (existing?.role === 'company_admin' && existing.status === 'active') throw new Error(`${input.email} is already a company admin`);
  const others = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.companyId, companyId), eq(memberships.role, 'company_admin'), ne(memberships.status, 'removed'), ...(existing ? [ne(memberships.id, existing.id)] : [])));
  if (others.length >= MAX_COMPANY_ADMINS) throw new Error(`A company can have at most ${MAX_COMPANY_ADMINS} company admins. Remove one first.`);
  const title = input.title || 'Company admin';
  if (existing) {
    await tx.update(memberships).set({ role: 'company_admin', status: 'active', title }).where(eq(memberships.id, existing.id));
    return existing.id;
  }
  const [m] = await tx.insert(memberships).values({ companyId, userId: user.id, role: 'company_admin', title, status: 'active' }).returning({ id: memberships.id });
  return m.id;
}
