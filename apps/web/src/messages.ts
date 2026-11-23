import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { SessionContext } from '@orbit/core';
import { memberships, messages, projects, users, type Tx } from '@orbit/db';

/** Migration 0008 not run yet: the messages table is missing. */
const missing = (err: unknown) => {
  const code = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '42P01' || /relation "messages" does not exist/.test(String(err));
};

/** Runs a messages query. Migration 0008 has run everywhere, so no savepoint (it cost two round trips per page). */
async function guarded<T>(tx: Tx, _fallback: T, fn: (sp: Tx) => Promise<T>): Promise<{ ok: boolean; data: T }> {
  return { ok: true, data: await fn(tx) };
}

export type MessageRow = {
  id: string;
  kind: 'message' | 'review';
  subject: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  otherName: string;
  otherRole: string;
  project: string | null;
};

/** Inbox or sent items for the signed-in person, newest first. */
export async function listMessages(tx: Tx, ctx: SessionContext, box: 'inbox' | 'sent') {
  const mine = box === 'inbox' ? messages.toId : messages.fromId;
  const other = box === 'inbox' ? messages.fromId : messages.toId;
  return guarded(tx, [] as MessageRow[], (sp) =>
    sp
      .select({
        id: messages.id,
        kind: messages.kind,
        subject: messages.subject,
        body: messages.body,
        createdAt: messages.createdAt,
        readAt: messages.readAt,
        otherName: users.name,
        otherRole: memberships.role,
        project: sql<string | null>`${projects.code} || ' ' || ${projects.name}`,
      })
      .from(messages)
      .innerJoin(memberships, eq(memberships.id, other))
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(projects, eq(projects.id, messages.projectId))
      .where(and(eq(messages.companyId, ctx.companyId), eq(mine, ctx.membershipId)))
      .orderBy(desc(messages.createdAt))
      .limit(100) as Promise<MessageRow[]>,
  );
}

export async function unreadCount(tx: Tx, ctx: SessionContext) {
  const r = await guarded(tx, 0, async (sp) => {
    const [{ n }] = await sp
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.companyId, ctx.companyId), eq(messages.toId, ctx.membershipId), isNull(messages.readAt)));
    return n;
  });
  return r.data;
}

/** People this person can write to: everyone active in the company except themselves, admins and PMs first. */
export async function recipients(tx: Tx, ctx: SessionContext) {
  const rows = await tx
    .select({ id: memberships.id, name: users.name, role: memberships.role, title: memberships.title })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.status, 'active')));
  const order = ['company_admin', 'project_manager', 'management', 'supervisor', 'employee'];
  return rows.filter((r) => r.id !== ctx.membershipId).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.name.localeCompare(b.name));
}

export async function projectChoices(tx: Tx, ctx: SessionContext) {
  return tx
    .select({ id: projects.id, label: sql<string>`${projects.code} || ' ' || ${projects.name}` })
    .from(projects)
    .where(and(eq(projects.companyId, ctx.companyId), eq(projects.status, 'active')))
    .orderBy(projects.code);
}

export const sendInput = z.object({
  to: z.array(z.uuid()).min(1, 'Choose at least one person').max(50),
  kind: z.enum(['message', 'review']),
  subject: z.string().trim().min(2, 'Add a subject').max(140),
  body: z.string().trim().min(2, 'Write a message').max(5000),
  projectId: z.uuid().nullable().optional(),
});

/** Sends one copy per recipient. Recipients must be active people of the same company. */
export async function sendMessage(tx: Tx, ctx: SessionContext, raw: z.input<typeof sendInput>) {
  const input = sendInput.parse(raw);
  const ok = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.status, 'active'), inArray(memberships.id, input.to)));
  if (ok.length !== new Set(input.to).size) throw new Error('Someone you chose is no longer in the company');
  const r = await guarded(tx, 0, async (sp) => {
    await sp.insert(messages).values(
      input.to.map((toId) => ({
        companyId: ctx.companyId,
        fromId: ctx.membershipId,
        toId,
        kind: input.kind,
        subject: input.subject,
        body: input.body,
        projectId: input.projectId ?? null,
      })),
    );
    return input.to.length;
  });
  if (!r.ok) throw new Error('Run the latest database update (pnpm db:migrate) to use messages.');
  return r.data;
}

export async function markRead(tx: Tx, ctx: SessionContext, id: string) {
  await guarded(tx, undefined, async (sp) => {
    await sp
      .update(messages)
      .set({ readAt: new Date() })
      .where(and(eq(messages.id, z.uuid().parse(id)), eq(messages.toId, ctx.membershipId), isNull(messages.readAt)));
  });
}

