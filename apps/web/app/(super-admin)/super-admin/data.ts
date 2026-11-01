import { asc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { readMemberPortals } from '@orbit/core';
import { getDb, getSession } from '@orbit/core/next';
import { companies, companyPortals, memberships, users, withTenant } from '@orbit/db';
import { portalModules } from '@/portals';

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
  management: 'Management',
  project_manager: 'Project manager',
  supervisor: 'Supervisor',
  employee: 'Employee',
};
const ROLE_ORDER = ['company_admin', 'management', 'project_manager', 'supervisor', 'employee'];
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

/** Every registered portal with its state for one company: on, requested (asked for, off) or not requested. */
export async function loadPortals(companyId: string, superUserId: string) {
  const db = await getDb();
  const rows = await withTenant(db, { companyId, userId: superUserId }, (tx) =>
    tx.select({ portal: companyPortals.portal, enabled: companyPortals.enabled }).from(companyPortals).where(eq(companyPortals.companyId, companyId)),
  );
  return Object.values(portalModules).map(({ manifest }) => {
    const r = rows.find((x) => x.portal === manifest.id);
    return { id: manifest.id, name: manifest.name, state: r ? (r.enabled ? ('on' as const) : ('requested' as const)) : ('none' as const) };
  });
}

/** Portal rows (requested / active / off) for the people of one company. */
export async function loadMemberPortals(companyId: string, superUserId: string, membershipIds: string[]) {
  const db = await getDb();
  return withTenant(db, { companyId, userId: superUserId }, (tx) => readMemberPortals(tx, membershipIds));
}

/** Everything waiting for Super Admin, across companies. */
export async function loadRequests(superUserId: string) {
  const all = await loadCompanies();
  const names = new Map(Object.values(portalModules).map((m) => [m.manifest.id, m.manifest.name]));
  const portalName = (id: string) => names.get(id) ?? id;
  const companies = all.filter((c) => c.status === 'pending');
  const companyPortals: { companyId: string; company: string; portal: string; name: string }[] = [];
  const people: { companyId: string; company: string; id: string; name: string; email: string; role: string; title: string | null }[] = [];
  const portals: { companyId: string; company: string; membershipId: string; person: string; email: string; portal: string; name: string; companyPortalOn: boolean }[] = [];
  for (const c of all.filter((x) => x.status === 'active')) {
    const [states, members] = await Promise.all([loadPortals(c.id, superUserId), loadPeople(c.id, superUserId)]);
    for (const s of states.filter((x) => x.state === 'requested')) companyPortals.push({ companyId: c.id, company: c.name, portal: s.id, name: s.name });
    for (const m of members.filter((x) => x.status === 'pending')) people.push({ companyId: c.id, company: c.name, id: m.id, name: m.name, email: m.email, role: m.role, title: m.title });
    const active = members.filter((x) => x.status === 'active');
    const rows = await loadMemberPortals(c.id, superUserId, active.map((m) => m.id));
    for (const r of rows.filter((x) => x.status === 'requested')) {
      const m = active.find((x) => x.id === r.membershipId)!;
      portals.push({
        companyId: c.id,
        company: c.name,
        membershipId: m.id,
        person: m.name,
        email: m.email,
        portal: r.portal,
        name: portalName(r.portal),
        companyPortalOn: states.some((s) => s.id === r.portal && s.state === 'on'),
      });
    }
  }
  return { companies, companyPortals, people, portals, total: companies.length + companyPortals.length + people.length + portals.length };
}
