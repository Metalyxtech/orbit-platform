'use server';
import { eq, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { companies, companyPortals, memberships, withTenant } from '@orbit/db';
import { COMPANY_COOKIE, getDb, getSession } from '@orbit/core/next';
import { requestMemberPortals } from '@orbit/core';
import { portalModules } from './portals';

/** Portal ids ticked on a form, limited to portals that exist. */
const pickedPortals = (form: FormData) => [...new Set(form.getAll('portals').map(String))].filter((p) => portalModules[p]);

export async function switchCompanyAction(companyId: string) {
  const s = await getSession();
  if (s.state !== 'ok' || !s.companies.some((c) => c.id === companyId)) return;
  (await cookies()).set(COMPANY_COOKIE, companyId, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  timezone: z.string().min(3).max(64),
  title: z.string().trim().max(100).optional(),
});

/** Company registration: the company and its first admin wait for Super Admin approval. */
export async function registerCompanyAction(form: FormData) {
  const s = await getSession();
  if (s.state !== 'no_company') redirect('/');
  const input = registerSchema.parse(Object.fromEntries(form));
  const portals = pickedPortals(form);
  if (portals.length === 0) redirect('/register?error=portals');
  const db = await getDb();
  if (await companyByName(input.name)) redirect('/register?error=exists');
  const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;
  const domain = s.email.split('@')[1];
  const [company] = await db
    .insert(companies)
    .values({ name: input.name, slug, timezone: input.timezone, emailDomains: domain ? [domain] : [] })
    .returning();
  await withTenant(db, { companyId: company.id, userId: s.userId }, async (tx) => {
    await tx.insert(memberships).values({
      companyId: company.id,
      userId: s.userId,
      role: 'company_admin',
      title: input.title || 'Company admin',
    });
    // Requested portals start switched off; Super Admin switches them on when approving.
    await tx.insert(companyPortals).values(portals.map((portal) => ({ companyId: company.id, portal, enabled: false })));
  });
  redirect('/pending');
}

/** Company names are matched without case or extra spaces, so "Hekur contractors " finds "Hekur Contractors". */
async function companyByName(name: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(companies)
    .where(sql`lower(btrim(${companies.name})) = lower(btrim(${name}))`)
    .limit(1);
  return row;
}

const joinSchema = z.object({
  company: z.string().trim().min(2).max(120),
  title: z.string().trim().max(100).optional(),
});

/** Join request: a pending employee membership that the company admin approves on the Users page. */
export async function joinCompanyAction(form: FormData) {
  const s = await getSession();
  if (s.state !== 'no_company') redirect('/');
  const input = joinSchema.parse(Object.fromEntries(form));
  const wanted = pickedPortals(form);
  if (wanted.length === 0) redirect('/register?error=portals');
  const company = await companyByName(input.company);
  if (!company || company.status !== 'active') redirect('/register?error=not_found');
  const db = await getDb();
  const offered = await withTenant(db, { companyId: company.id, userId: s.userId }, async (tx) => {
    const has = (await tx.select({ portal: companyPortals.portal }).from(companyPortals).where(eq(companyPortals.companyId, company.id))).map(
      (r) => r.portal,
    );
    const ok = wanted.filter((p) => has.includes(p));
    if (ok.length === 0) return false;
    const [m] = await tx
      .insert(memberships)
      .values({ companyId: company.id, userId: s.userId, role: 'employee', title: input.title || null, status: 'pending' })
      // Someone removed from this company earlier can ask to join again.
      .onConflictDoUpdate({
        target: [memberships.companyId, memberships.userId],
        set: { status: 'pending', role: 'employee', title: input.title || null, supervisorId: null },
        setWhere: sql`${memberships.status}::text = 'removed'`,
      })
      .returning({ id: memberships.id });
    if (m) await requestMemberPortals(tx, company.id, m.id, ok);
    return true;
  });
  if (!offered) redirect('/register?error=no_portal');
  redirect('/pending');
}
