import { asc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb, getSession } from '@orbit/core/next';
import { companies, memberships, users, withTenant } from '@orbit/db';

const NO_USER = '00000000-0000-0000-0000-000000000000';

/** Super Admin pages: returns the caller's user id, or sends anyone else home. */
export async function requireSuperAdminPage() {
  const s = await getSession();
  if (s.state === 'ok' && s.ctx.isSuperAdmin) return { userId: s.ctx.userId, name: s.ctx.name, hasCompany: true };
  if ((s.state === 'no_company' || s.state === 'pending') && s.isSuperAdmin) {
    return { userId: s.state === 'no_company' ? s.userId : NO_USER, name: s.state === 'no_company' ? s.name : 'Super Admin', hasCompany: false };
  }
  redirect('/');
}

export const ROLE_LABEL: Record<string, string> = {
  company_admin: 'Company admin',
  project_manager: 'Project manager',
  supervisor: 'Supervisor',
  employee: 'Employee',
};
const ROLE_ORDER = ['company_admin', 'project_manager', 'supervisor', 'employee'];
const STATUS_ORDER = ['pending', 'active', 'disabled'];

export type Person = Awaited<ReturnType<typeof loadPeople>>[number];

/** People of one company, pending first, then by role seniority and name. Read inside the company's RLS scope. */
export async function loadPeople(companyId: string, superUserId: string) {
  const db = await getDb();
  const rows = await withTenant(db, { companyId, userId: superUserId }, (tx) =>
    tx
      .select({
        id: memberships.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        title: memberships.title,
        status: memberships.status,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.companyId, companyId))
      .orderBy(asc(users.name)),
  );
  return rows.sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
  );
}

export async function loadCompanies() {
  const db = await getDb();
  return db.select().from(companies).orderBy(asc(companies.name));
}

export const companyStatusChip = (status: string) => (status === 'suspended' ? 'blocked' : status);
export const memberStatusChip = (status: string) => (status === 'disabled' ? 'blocked' : status);
export const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
