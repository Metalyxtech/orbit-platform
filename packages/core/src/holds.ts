import { and, desc, eq, inArray } from 'drizzle-orm';
import { memberships, processComments, processHolds, users, type Tx } from '@orbit/db';
import { audit } from './audit';
import type { ActionContext, SessionContext } from './session';

// GM process control, shared by every portal: the GM (management) or a company admin can stop any
// process (a purchase request, work order, material request, inspection, or an enquiry with its
// quotation and order)
// with a reason, resume it with a note, and anyone working on it can comment. A held process
// cannot move on: each portal calls assertNotHeld() where it changes the record.
// Portals register how to describe their records (ref, title, link); the app connects them.

/** The kinds of records that can be held, and the portal each belongs to. */
export const CONTROLLED = {
  proc_request: { portal: 'procurement', label: 'Purchase request' },
  work_order: { portal: 'production', label: 'Work order' },
  mat_request: { portal: 'production', label: 'Material request' },
  qc_inspection: { portal: 'quality', label: 'Inspection' },
  sales_enquiry: { portal: 'sales', label: 'Enquiry / quotation' },
} as const;
export type Controlled = keyof typeof CONTROLLED;
export const isControlled = (e: string): e is Controlled => e in CONTROLLED;

/** The GM (management) and company admins stop and resume processes. */
export const canControl = (ctx: Pick<SessionContext, 'role'>) => ctx.role === 'management' || ctx.role === 'company_admin';

type Describer = (tx: Tx, companyId: string, id: string) => Promise<{ ref: string; title: string; href: string } | null>;
const KEY = Symbol.for('orbit.control.describers');
const describers = ((globalThis as Record<symbol, unknown>)[KEY] ??= new Map<Controlled, Describer>()) as Map<Controlled, Describer>;
/** A portal says how to find and name its records. */
export function describeProcess(entity: Controlled, d: Describer) {
  describers.set(entity, d);
}

/**
 * The records a record came from, possibly in another portal: a purchase request raised for a
 * material request, which belongs to a work order, which came from a sales order's enquiry. A hold
 * on any of them stops everything that follows.
 */
type Parents = (tx: Tx, companyId: string, id: string) => Promise<{ entity: Controlled; id: string }[]>;
const PKEY = Symbol.for('orbit.control.parents');
const parents = ((globalThis as Record<symbol, unknown>)[PKEY] ??= new Map<Controlled, Parents>()) as Map<Controlled, Parents>;
export function linkProcess(entity: Controlled, p: Parents) {
  parents.set(entity, p);
}

const missing = (err: unknown) => {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '42P01' || /relation "process_(holds|comments)" does not exist/.test(String(err));
};

export interface HoldInfo {
  reason: string;
  by: string;
  at: string;
  /** Set when the stop was put on an earlier record in the chain (resume it there). */
  from?: { entity: Controlled; label: string; ref: string; href: string } | null;
}

/** The hold put on this record itself, or null (also null before migration 0028). */
async function ownHold(tx: Tx, companyId: string, entity: Controlled, entityId: string) {
  try {
    return await tx.transaction(async (sp) => {
      const [h] = await sp
        .select({ reason: processHolds.reason, at: processHolds.heldAt, by: users.name, ref: processHolds.ref, href: processHolds.href })
        .from(processHolds)
        .innerJoin(memberships, eq(memberships.id, processHolds.heldBy))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(processHolds.companyId, companyId), eq(processHolds.entity, entity), eq(processHolds.entityId, entityId), eq(processHolds.status, 'held')))
        .limit(1);
      return h ?? null;
    });
  } catch (err) {
    if (missing(err)) return null;
    throw err;
  }
}

/**
 * The hold that stops this record: its own, or one on a record it came from (in any portal),
 * nearest first. Null when nothing in the chain is stopped.
 */
export async function holdOf(tx: Tx, companyId: string, entity: Controlled, entityId: string): Promise<HoldInfo | null> {
  const seen = new Set<string>();
  let level: { entity: Controlled; id: string }[] = [{ entity, id: entityId }];
  for (let depth = 0; depth < 6 && level.length; depth++) {
    const next: { entity: Controlled; id: string }[] = [];
    for (const r of level) {
      const k = `${r.entity}:${r.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const h = await ownHold(tx, companyId, r.entity, r.id);
      if (h) {
        const self = depth === 0;
        return { reason: h.reason, by: h.by, at: h.at.toISOString(), from: self ? null : { entity: r.entity, label: CONTROLLED[r.entity].label, ref: h.ref, href: h.href } };
      }
      const p = parents.get(r.entity);
      if (p) next.push(...(await p(tx, companyId, r.id).catch(() => [])));
    }
    level = next;
  }
  return null;
}

/** Throws when the GM has stopped this record, or a record it came from. Portals call it wherever the record changes. */
export async function assertNotHeld(tx: Tx, companyId: string, entity: Controlled, entityId: string, ref?: string) {
  const h = await holdOf(tx, companyId, entity, entityId);
  if (!h) return;
  const what = ref ?? CONTROLLED[entity].label;
  if (h.from) throw new Error(`${what} is stopped: ${h.from.label.toLowerCase()} ${h.from.ref} is on hold by ${h.by}: "${h.reason}". It can move on once ${h.from.ref} is resumed.`);
  throw new Error(`${what} is on hold by ${h.by}: "${h.reason}". It can move on once it is resumed.`);
}

export interface ProcessThread {
  entity: Controlled;
  entityId: string;
  hold: HoldInfo | null;
  comments: { id: string; kind: 'comment' | 'hold' | 'release'; text: string; by: string; role: string; at: string }[];
  canControl: boolean;
}

/** Hold and comments of one record, for its page. */
export async function processThread(tx: Tx, ctx: SessionContext, entity: Controlled, entityId: string): Promise<ProcessThread> {
  const empty: ProcessThread = { entity, entityId, hold: null, comments: [], canControl: canControl(ctx) };
  try {
    return await tx.transaction(async (sp) => {
      const rows = await sp
        .select({ c: processComments, by: users.name, role: memberships.role })
        .from(processComments)
        .innerJoin(memberships, eq(memberships.id, processComments.byId))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(processComments.companyId, ctx.companyId), eq(processComments.entity, entity), eq(processComments.entityId, entityId)))
        .orderBy(processComments.createdAt);
      return {
        ...empty,
        hold: await holdOf(sp, ctx.companyId, entity, entityId),
        comments: rows.map(({ c, by, role }) => ({ id: c.id, kind: c.kind, text: c.text, by, role: role === 'management' ? 'GM' : role === 'company_admin' ? 'Admin' : '', at: c.createdAt.toISOString() })),
      };
    });
  } catch (err) {
    if (missing(err)) return empty;
    throw err;
  }
}

async function target(tx: Tx, companyId: string, entity: string, entityId: string) {
  if (!isControlled(entity)) throw new Error('This page cannot be put on hold');
  const d = describers.get(entity);
  if (!d) throw new Error('Orbit cannot reach that portal right now. Try again in a moment.');
  const t = await d(tx, companyId, entityId);
  if (!t) throw new Error(`${CONTROLLED[entity].label} not found`);
  return { entity, portal: CONTROLLED[entity].portal, ...t };
}

/** Stops (hold) or resumes a process, with a reason / note that everyone on it sees. */
export async function setHold(tx: Tx, ctx: ActionContext, input: { entity: string; entityId: string; hold: boolean; note: string }) {
  if (!canControl(ctx)) throw new Error('Only the GM or a company admin can stop or resume a process');
  const note = input.note.trim().slice(0, 1000);
  if (note.length < 3) throw new Error(input.hold ? 'Say why you are stopping it' : 'Add a note for the team');
  const t = await target(tx, ctx.companyId, input.entity, input.entityId);
  const open = await ownHold(tx, ctx.companyId, t.entity, input.entityId);
  if (input.hold && open) throw new Error('It is already on hold');
  if (!input.hold && !open) {
    const up = await holdOf(tx, ctx.companyId, t.entity, input.entityId);
    throw new Error(up?.from ? `This was stopped at ${up.from.ref}. Resume it there.` : 'It is not on hold');
  }
  if (input.hold) {
    await tx.insert(processHolds).values({ companyId: ctx.companyId, portal: t.portal, entity: t.entity, entityId: input.entityId, ref: t.ref, title: t.title, href: t.href, reason: note, heldBy: ctx.membershipId });
  } else {
    await tx
      .update(processHolds)
      .set({ status: 'released', releasedBy: ctx.membershipId, releasedAt: new Date(), releaseNote: note })
      .where(and(eq(processHolds.companyId, ctx.companyId), eq(processHolds.entity, t.entity), eq(processHolds.entityId, input.entityId), eq(processHolds.status, 'held')));
  }
  await tx.insert(processComments).values({ companyId: ctx.companyId, portal: t.portal, entity: t.entity, entityId: input.entityId, ref: t.ref, title: t.title, href: t.href, kind: input.hold ? 'hold' : 'release', text: note, byId: ctx.membershipId });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: input.hold ? 'control.hold' : 'control.release', entity: t.entity, entityId: input.entityId, data: { summary: [`${t.ref} ${input.hold ? 'put on hold' : 'resumed'}: ${note}`] }, requestId: ctx.requestId });
  return { ok: true as const };
}

/** A comment on a process. Anyone who can open it can comment; the GM's are marked. */
export async function addProcessComment(tx: Tx, ctx: ActionContext, input: { entity: string; entityId: string; text: string }) {
  const text = input.text.trim().slice(0, 2000);
  if (text.length < 2) throw new Error('Write a comment');
  const t = await target(tx, ctx.companyId, input.entity, input.entityId);
  await tx.insert(processComments).values({ companyId: ctx.companyId, portal: t.portal, entity: t.entity, entityId: input.entityId, ref: t.ref, title: t.title, href: t.href, kind: 'comment', text, byId: ctx.membershipId });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'control.comment', entity: t.entity, entityId: input.entityId, data: { summary: [`Comment on ${t.ref}: ${text.slice(0, 160)}`] }, requestId: ctx.requestId });
  return { ok: true as const };
}

/** Everything on hold and the latest comments, across portals (the GM's control page). */
export async function controlOverview(tx: Tx, ctx: SessionContext, portals: string[]) {
  try {
    return await tx.transaction(async (sp) => {
      const held = await sp
        .select({ h: processHolds, by: users.name })
        .from(processHolds)
        .innerJoin(memberships, eq(memberships.id, processHolds.heldBy))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(processHolds.companyId, ctx.companyId), eq(processHolds.status, 'held'), portals.length ? inArray(processHolds.portal, portals) : undefined))
        .orderBy(desc(processHolds.heldAt));
      const recent = await sp
        .select({ c: processComments, by: users.name, role: memberships.role })
        .from(processComments)
        .innerJoin(memberships, eq(memberships.id, processComments.byId))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(processComments.companyId, ctx.companyId), portals.length ? inArray(processComments.portal, portals) : undefined))
        .orderBy(desc(processComments.createdAt))
        .limit(50);
      return {
        ready: true,
        held: held.map(({ h, by }) => ({ id: h.id, portal: h.portal, entity: h.entity as Controlled, ref: h.ref, title: h.title, href: h.href, reason: h.reason, by, at: h.heldAt.toISOString() })),
        recent: recent.map(({ c, by, role }) => ({ id: c.id, portal: c.portal, entity: c.entity as Controlled, ref: c.ref, title: c.title, href: c.href, kind: c.kind, text: c.text, by, gm: role === 'management', at: c.createdAt.toISOString() })),
      };
    });
  } catch (err) {
    if (missing(err)) return { ready: false, held: [], recent: [] };
    throw err;
  }
}

/** How many processes are on hold (for the menu badge). */
export async function heldCount(tx: Tx, companyId: string) {
  try {
    return await tx.transaction(async (sp) => (await sp.select({ id: processHolds.id }).from(processHolds).where(and(eq(processHolds.companyId, companyId), eq(processHolds.status, 'held')))).length);
  } catch {
    return 0;
  }
}
