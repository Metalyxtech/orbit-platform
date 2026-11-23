import { and, eq, inArray, sql } from 'drizzle-orm';
import { portalRoleFor, readPortalRoles, type SessionContext } from '@orbit/core';
import { memberships, procSettings, projects, users, type Tx } from '@orbit/db';
import { configFromTemplate, withoutViewOnly, type ProcConfig, type ProcRole } from '../config';
import { procurementManifest } from '../manifest';

export const PORTAL = 'procurement';

const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
/** Migration 0010 not run yet. */
export const notReady = (err: unknown) => pgCode(err) === '42P01' || /relation "proc_\w+" does not exist/.test(String(err));
export const NOT_READY = 'The Purchase portal switches on after the latest database update.';

/** The purchase role this person acts as. */
export async function myRole(tx: Tx, ctx: SessionContext): Promise<ProcRole> {
  const stored = (await readPortalRoles(tx, PORTAL, [ctx.membershipId])).get(ctx.membershipId);
  return portalRoleFor(procurementManifest, ctx.role, stored) as ProcRole;
}

/** The person's purchase role plus any roles they cover (admins only). Workflow steps use this list. */
export async function myRoles(tx: Tx, ctx: SessionContext): Promise<{ role: ProcRole; roles: ProcRole[] }> {
  const role = await myRole(tx, ctx);
  if (role !== 'admin') return { role, roles: [role] };
  const cfg = await loadConfig(tx, ctx.companyId);
  return { role, roles: ['admin', ...(cfg.covers?.[ctx.membershipId] ?? [])] };
}

export function requireRole(me: ProcRole, ...roles: ProcRole[]) {
  if (me !== 'admin' && !roles.includes(me)) throw new Error('Your purchase role cannot do this');
}

export function requireAdmin(ctx: SessionContext) {
  if (ctx.role !== 'company_admin') throw new Error('Only the company admin can change purchase settings');
}

/** The company's purchase configuration (a General purchasing copy until the admin picks a template). */
export async function loadConfig(tx: Tx, companyId: string): Promise<ProcConfig> {
  const [row] = await tx.select({ config: procSettings.config }).from(procSettings).where(eq(procSettings.companyId, companyId));
  return row ? withoutViewOnly(row.config as ProcConfig) : configFromTemplate('general');
}

export async function saveConfig(tx: Tx, companyId: string, config: ProcConfig) {
  await tx
    .insert(procSettings)
    .values({ companyId, config })
    .onConflictDoUpdate({ target: procSettings.companyId, set: { config, updatedAt: new Date() } });
}

/** Next requisition or PO number, counted per company inside the same transaction. */
export async function nextNumber(tx: Tx, companyId: string, kind: 'pr' | 'po', cfg: ProcConfig): Promise<string> {
  await tx.insert(procSettings).values({ companyId, config: cfg }).onConflictDoNothing();
  const col = kind === 'pr' ? procSettings.prSeq : procSettings.poSeq;
  const [row] = await tx
    .update(procSettings)
    .set(kind === 'pr' ? { prSeq: sql`${col} + 1` } : { poSeq: sql`${col} + 1` })
    .where(eq(procSettings.companyId, companyId))
    .returning({ n: col });
  return `${kind === 'pr' ? cfg.numbering.prPrefix : cfg.numbering.poPrefix}-${row.n}`;
}

/** membershipId -> { name, title } for display. */
export async function peopleById(tx: Tx, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (list.length === 0) return new Map<string, { name: string; title: string | null }>();
  const rows = await tx
    .select({ id: memberships.id, name: users.name, title: memberships.title })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(inArray(memberships.id, list));
  return new Map(rows.map((r) => [r.id, { name: r.name, title: r.title }]));
}

/** Project names for the requisition form: the company's active projects, plus General stores. */
export async function projectNames(tx: Tx, companyId: string, extra: string[] = []) {
  const rows = await tx
    .select({ code: projects.code, name: projects.name })
    .from(projects)
    .where(and(eq(projects.companyId, companyId), eq(projects.status, 'active')));
  return [...extra, ...rows.map((r) => `${r.code} ${r.name}`), 'General stores'];
}

export const today = (ctx: SessionContext) => new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone });

/** Money for timeline text, e.g. $12,093 or $1,209.30. */
export const moneyText = (cfg: ProcConfig, v: number) =>
  `${cfg.money.currency}${v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
