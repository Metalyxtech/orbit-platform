import { and, eq } from 'drizzle-orm';
import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { ZodError } from 'zod';
import { companies, memberships, users, withTenant, type Tx } from '@orbit/db';
import { Effects } from '../effects';
import { uuidv7 } from '../events';
import type { ActionContext, SessionContext } from '../session';
import { WorkflowConflictError } from '../workflow/types';
import { devAuthEnabled, readIdentity } from './auth';
import { getDb } from './db';

export const COMPANY_COOKIE = 'orbit_company';
const NO_COMPANY = '00000000-0000-0000-0000-000000000000';

export type SessionState =
  | { state: 'signed_out' }
  | { state: 'no_company'; userId: string; email: string; name: string; isSuperAdmin: boolean }
  | { state: 'pending'; companyName: string; isSuperAdmin: boolean }
  | { state: 'ok'; ctx: SessionContext; companies: { id: string; name: string }[] };

/** Resolves who is calling and which company they act in. Cached per request. */
export const getSession = cache(async (): Promise<SessionState> => {
  const identity = await readIdentity();
  if (!identity) return { state: 'signed_out' };
  const db = await getDb();

  // users has no RLS: it is identity, not tenant data.
  let [user] = await db
    .select()
    .from(users)
    .where(devAuthEnabled() ? eq(users.email, identity.email) : eq(users.workosUserId, identity.workosUserId));
  if (!user && !devAuthEnabled()) {
    // First sign-in. An admin may have pre-created the user by email (invite / seed).
    [user] = await db
      .insert(users)
      .values({ workosUserId: identity.workosUserId, email: identity.email, name: identity.name })
      .onConflictDoUpdate({ target: users.email, set: { workosUserId: identity.workosUserId } })
      .returning();
  }
  if (!user) return { state: 'signed_out' };

  // RLS lets a user see their own memberships in any company (app.user_id).
  const rows = await withTenant(db, { companyId: NO_COMPANY, userId: user.id }, (tx) =>
    tx
      .select({ m: memberships, c: companies })
      .from(memberships)
      .innerJoin(companies, eq(companies.id, memberships.companyId))
      .where(eq(memberships.userId, user.id)),
  );
  const active = rows.filter((r) => r.m.status === 'active' && r.c.status === 'active');
  if (active.length === 0) {
    const pending = rows.find((r) => r.m.status === 'pending' || r.c.status === 'pending');
    return pending
      ? { state: 'pending', companyName: pending.c.name, isSuperAdmin: user.isSuperAdmin }
      : { state: 'no_company', userId: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin };
  }

  const chosen = (await cookies()).get(COMPANY_COOKIE)?.value;
  const pick =
    active.find((r) => r.c.id === chosen) ??
    active.find((r) => identity.organizationId && r.c.workosOrgId === identity.organizationId) ??
    active[0];
  const h = await headers();
  return {
    state: 'ok',
    companies: active.map((r) => ({ id: r.c.id, name: r.c.name })),
    ctx: {
      requestId: h.get('x-amzn-trace-id') ?? h.get('x-vercel-id') ?? uuidv7(),
      userId: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      companyId: pick.c.id,
      companyName: pick.c.name,
      companyStage: pick.c.stage,
      timezone: pick.c.timezone,
      membershipId: pick.m.id,
      role: pick.m.role,
      title: pick.m.title,
    },
  };
});

/** For pages: sends people to sign-in, registration or the pending screen as needed. */
export async function requireSession(): Promise<SessionContext> {
  const s = await getSession();
  if (s.state === 'signed_out') redirect('/sign-in');
  if (s.state === 'pending') redirect('/pending');
  if (s.state === 'no_company') redirect(s.isSuperAdmin ? '/super-admin' : '/register');
  return s.ctx;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; conflict?: boolean };

const SERVER_ERROR = "Couldn't save. Your changes are kept here; we'll retry in a few seconds.";

function userMessage(err: unknown): string {
  if (err instanceof ZodError) return err.issues[0]?.message ?? 'Check the values you entered';
  // Database / SDK errors carry a code or are not ours: never show their text.
  if (err instanceof Error && !('code' in err) && (err.constructor === Error || err.name === 'ForbiddenError')) {
    return err.message;
  }
  return SERVER_ERROR;
}

/**
 * Runs a server action as the signed-in member: one RLS-scoped transaction, then the
 * outbox publish and timers after commit.
 */
export async function runAction<T>(fn: (tx: Tx, ctx: ActionContext) => Promise<T>): Promise<ActionResult<T>> {
  const session = await requireSession();
  const db = await getDb();
  const ctx: ActionContext = { ...session, effects: new Effects() };
  const scope = { companyId: ctx.companyId, userId: ctx.userId };
  try {
    const data = await withTenant(db, scope, (tx) => fn(tx, ctx));
    await ctx.effects.flush(db, scope);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof WorkflowConflictError) return { ok: false, error: err.message, conflict: true };
    console.error(JSON.stringify({ requestId: ctx.requestId, error: String(err), stack: (err as Error)?.stack }));
    return { ok: false, error: userMessage(err) };
  }
}

/** Read-only tenant query for server components. Throws on error (error boundary shows it). */
export async function query<T>(fn: (tx: Tx, ctx: SessionContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  const db = await getDb();
  return withTenant(db, { companyId: ctx.companyId, userId: ctx.userId }, (tx) => fn(tx, ctx));
}

/** System context for timers and webhooks (no signed-in user). */
export async function runAsSystem<T>(companyId: string, requestId: string, fn: (tx: Tx, ctx: ActionContext) => Promise<T>) {
  const db = await getDb();
  const [company] = await db.select().from(companies).where(and(eq(companies.id, companyId), eq(companies.status, 'active')));
  if (!company) throw new Error('Company not found or not active');
  const ctx: ActionContext = {
    requestId,
    userId: NO_COMPANY,
    email: 'system',
    name: 'Orbit',
    isSuperAdmin: false,
    companyId,
    companyName: company.name,
    companyStage: company.stage,
    timezone: company.timezone,
    membershipId: NO_COMPANY,
    role: 'company_admin',
    title: null,
    effects: new Effects(),
  };
  const scope = { companyId, userId: NO_COMPANY };
  const data = await withTenant(db, scope, (tx) => fn(tx, ctx));
  await ctx.effects.flush(db, scope);
  return data;
}
