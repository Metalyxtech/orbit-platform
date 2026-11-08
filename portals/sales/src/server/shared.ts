import { eq, inArray, sql } from 'drizzle-orm';
import { audit, portalRoleFor, readPortalRoles, type ActionContext, type SessionContext } from '@orbit/core';
import { memberships, salesEnquiries, salesEvents, salesSettings, users, type Tx } from '@orbit/db';
import { DEFAULT_CONFIG, type SalesConfig, type SalesRole } from '../config';
import { salesManifest } from '../manifest';

export const PORTAL = 'sales';

const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
/** Migration 0019 not run yet. */
export const notReady = (err: unknown) => pgCode(err) === '42P01' || /relation "sales_\w+" does not exist/.test(String(err));
export const NOT_READY = 'The Sales portal switches on after the latest database update.';

/** The sales role this person acts as (company admin: admin, management: GM, others: sales executive). */
export async function myRole(tx: Tx, ctx: SessionContext): Promise<SalesRole> {
  const stored = (await readPortalRoles(tx, PORTAL, [ctx.membershipId])).get(ctx.membershipId);
  return portalRoleFor(salesManifest, ctx.role, stored) as SalesRole;
}

/** Throws unless this person has one of the roles (the sales admin can do everything). */
export function requireRole(me: SalesRole, ...roles: SalesRole[]) {
  if (me !== 'admin' && !roles.includes(me)) throw new Error('Your sales role cannot do this');
}
export const hasRole = (me: SalesRole, ...roles: SalesRole[]) => me === 'admin' || roles.includes(me);

export async function loadConfig(tx: Tx, companyId: string): Promise<SalesConfig> {
  const [row] = await tx.select({ config: salesSettings.config }).from(salesSettings).where(eq(salesSettings.companyId, companyId));
  return { ...DEFAULT_CONFIG, ...((row?.config as Partial<SalesConfig> | undefined) ?? {}) };
}

export async function saveConfig(tx: Tx, companyId: string, config: SalesConfig) {
  await tx
    .insert(salesSettings)
    .values({ companyId, config })
    .onConflictDoUpdate({ target: salesSettings.companyId, set: { config, updatedAt: new Date() } });
}

const SEQ = { enq: salesSettings.enqSeq, qt: salesSettings.qtSeq, so: salesSettings.soSeq, inv: salesSettings.invSeq } as const;

/** Next document number, counted per company inside the same transaction. */
export async function nextNumber(tx: Tx, companyId: string, kind: keyof typeof SEQ): Promise<string> {
  await tx.insert(salesSettings).values({ companyId, config: DEFAULT_CONFIG }).onConflictDoNothing();
  const col = SEQ[kind];
  const set = { enq: { enqSeq: sql`${col} + 1` }, qt: { qtSeq: sql`${col} + 1` }, so: { soSeq: sql`${col} + 1` }, inv: { invSeq: sql`${col} + 1` } }[kind];
  const [row] = await tx.update(salesSettings).set(set).where(eq(salesSettings.companyId, companyId)).returning({ n: col });
  const now = new Date();
  const yymm = `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const fy = now.getUTCMonth() >= 3 ? `${String(now.getUTCFullYear()).slice(2)}-${String(now.getUTCFullYear() + 1).slice(2)}` : `${String(now.getUTCFullYear() - 1).slice(2)}-${String(now.getUTCFullYear()).slice(2)}`;
  if (kind === 'enq') return `ENQ-${row.n}`;
  if (kind === 'qt') return `QT-${yymm}-${String(row.n).padStart(3, '0')}`;
  if (kind === 'so') return `SO-${String(row.n).padStart(4, '0')}`;
  return `INV/${fy}/${String(row.n).padStart(4, '0')}`;
}

/** membershipId -> name, for display. */
export async function peopleById(tx: Tx, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, string>();
  const rows = await tx.select({ id: memberships.id, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(inArray(memberships.id, list));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** A line on the enquiry's timeline, plus the company's change history for key steps. */
export async function logEvent(tx: Tx, ctx: ActionContext, enquiryId: string, text: string, action?: string) {
  await tx.insert(salesEvents).values({ companyId: ctx.companyId, enquiryId, text, byId: ctx.membershipId });
  if (action) await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action, entity: 'sales_enquiries', entityId: enquiryId, data: { summary: [text] }, requestId: ctx.requestId });
}

/** Locks the enquiry row for a change and checks it belongs to this company. */
export async function lockEnquiry(tx: Tx, ctx: SessionContext, id: string) {
  const [r] = await tx.select().from(salesEnquiries).where(eq(salesEnquiries.id, id)).for('update');
  if (!r || r.companyId !== ctx.companyId) throw new Error('Enquiry not found');
  return r;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
