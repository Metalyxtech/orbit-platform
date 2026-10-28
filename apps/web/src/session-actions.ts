'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { companies, memberships, withTenant } from '@orbit/db';
import { COMPANY_COOKIE, getDb, getSession } from '@orbit/core/next';

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
  const db = await getDb();
  const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;
  const domain = s.email.split('@')[1];
  const [company] = await db
    .insert(companies)
    .values({ name: input.name, slug, timezone: input.timezone, emailDomains: domain ? [domain] : [] })
    .returning();
  await withTenant(db, { companyId: company.id, userId: s.userId }, (tx) =>
    tx.insert(memberships).values({
      companyId: company.id,
      userId: s.userId,
      role: 'company_admin',
      title: input.title || 'Company admin',
    }),
  );
  redirect('/pending');
}
