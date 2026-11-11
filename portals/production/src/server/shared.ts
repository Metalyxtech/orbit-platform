import { eq, inArray, sql } from 'drizzle-orm';
import { audit, portalRoleFor, readPortalRoles, type ActionContext, type SessionContext } from '@orbit/core';
import { memberships, prodEvents, prodSettings, prodWorkOrders, users, type Tx } from '@orbit/db';
import { DEFAULT_CONFIG, type ProdConfig, type ProdRole } from '../config';
import { productionManifest } from '../manifest';

export const PORTAL = 'production';

const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
/** Migration 0023 not run yet. */
export const notReady = (err: unknown) => pgCode(err) === '42P01' || /relation "prod_\w+" does not exist/.test(String(err));
export const NOT_READY = 'The Production portal switches on after the latest database update.';

/** The production role this person acts as (company admin: admin, management: GM, others: supervisor). */
export async function myRole(tx: Tx, ctx: SessionContext): Promise<ProdRole> {
  const stored = (await readPortalRoles(tx, PORTAL, [ctx.membershipId])).get(ctx.membershipId);
  return portalRoleFor(productionManifest, ctx.role, stored) as ProdRole;
}

/** Throws unless this person has one of the roles (the production admin can do everything). */
export function requireRole(me: ProdRole, ...roles: ProdRole[]) {
  if (me !== 'admin' && !roles.includes(me)) throw new Error('Your production role cannot do this');
}
export const hasRole = (me: ProdRole, ...roles: ProdRole[]) => me === 'admin' || roles.includes(me);

export async function loadConfig(tx: Tx, companyId: string): Promise<ProdConfig> {
  const [row] = await tx.select({ config: prodSettings.config }).from(prodSettings).where(eq(prodSettings.companyId, companyId));
  return { ...DEFAULT_CONFIG, ...((row?.config as Partial<ProdConfig> | undefined) ?? {}) };
}

export async function saveConfig(tx: Tx, companyId: string, config: ProdConfig) {
  await tx
    .insert(prodSettings)
    .values({ companyId, config })
    .onConflictDoUpdate({ target: prodSettings.companyId, set: { config, updatedAt: new Date() } });
}

const SEQ = { wo: prodSettings.woSeq, qc: prodSettings.qcSeq, ncr: prodSettings.ncrSeq } as const;

/** Next document number, counted per company inside the same transaction. */
export async function nextNumber(tx: Tx, companyId: string, kind: keyof typeof SEQ): Promise<string> {
  await tx.insert(prodSettings).values({ companyId, config: DEFAULT_CONFIG }).onConflictDoNothing();
  const col = SEQ[kind];
  const set = { wo: { woSeq: sql`${col} + 1` }, qc: { qcSeq: sql`${col} + 1` }, ncr: { ncrSeq: sql`${col} + 1` } }[kind];
  const [row] = await tx.update(prodSettings).set(set).where(eq(prodSettings.companyId, companyId)).returning({ n: col });
  if (kind === 'wo') return `WO-${row.n}`;
  return `${kind === 'qc' ? 'QC' : 'NCR'}-${String(row.n).padStart(4, '0')}`;
}

/** membershipId -> name, for display. */
export async function peopleById(tx: Tx, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, string>();
  const rows = await tx.select({ id: memberships.id, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(inArray(memberships.id, list));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** A line on the work order's timeline, plus the company's change history for key steps. */
export async function logEvent(tx: Tx, ctx: ActionContext, workOrderId: string, text: string, action?: string) {
  await tx.insert(prodEvents).values({ companyId: ctx.companyId, workOrderId, text, byId: ctx.membershipId });
  if (action) await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action, entity: 'prod_work_orders', entityId: workOrderId, data: { summary: [text] }, requestId: ctx.requestId });
}

/** Locks the work order row for a change and checks it belongs to this company. */
export async function lockWo(tx: Tx, ctx: SessionContext, id: string) {
  const [r] = await tx.select().from(prodWorkOrders).where(eq(prodWorkOrders.id, id)).for('update');
  if (!r || r.companyId !== ctx.companyId) throw new Error('Work order not found');
  return r;
}

export const today = () => new Date().toISOString().slice(0, 10);
