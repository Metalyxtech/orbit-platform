import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@orbit/core/next';
import { companies, legalAcceptances, memberships, users, withTenant, type Tx } from '@orbit/db';
import { LEGAL_DOCS, type LegalDoc } from './documents';

// Who has signed which version of the Terms and the Privacy Policy. Server only.

const NO_COMPANY = '00000000-0000-0000-0000-000000000000';
const missing = (err: unknown) => {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '42P01' || /relation "legal_acceptances" does not exist/.test(String(err));
};

/** Documents this person still has to sign (current versions). Empty before migration 0013. */
export async function unsignedDocs(userId: string): Promise<LegalDoc[]> {
  const db = await getDb();
  try {
    const rows = await withTenant(db, { companyId: NO_COMPANY, userId }, (tx) =>
      tx.select({ document: legalAcceptances.document, version: legalAcceptances.version }).from(legalAcceptances).where(eq(legalAcceptances.userId, userId)),
    );
    return LEGAL_DOCS.filter((d) => !rows.some((r) => r.document === d.id && r.version === d.version)).map((d) => d.id);
  } catch (err) {
    if (missing(err)) return [];
    throw err;
  }
}

export const signInput = z.object({
  signedName: z.string().trim().min(2, 'Type your full name to sign').max(120),
  terms: z.literal(true, { error: 'Tick that you agree to the Terms and Conditions' }),
  privacy: z.literal(true, { error: 'Tick that you agree to the Privacy Policy' }),
});

/** Records the person's signature on every current document they have not signed yet. */
export async function signDocs(input: { userId: string; companyId: string | null; role: string | null; signedName: string; ip: string | null; userAgent: string | null }) {
  const todo = await unsignedDocs(input.userId);
  if (!todo.length) return;
  const db = await getDb();
  await withTenant(db, { companyId: input.companyId ?? NO_COMPANY, userId: input.userId }, (tx) =>
    tx.insert(legalAcceptances).values(
      LEGAL_DOCS.filter((d) => todo.includes(d.id)).map((d) => ({
        userId: input.userId,
        companyId: input.companyId,
        document: d.id,
        version: d.version,
        signedName: input.signedName,
        role: input.role,
        ip: input.ip?.slice(0, 64) ?? null,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
      })),
    ),
  );
}

/** Signatures made before the person had a company are filed under the company they join or register. */
export async function fileUnderCompany(tx: Tx, userId: string, companyId: string) {
  try {
    await tx.transaction((sp) =>
      sp.update(legalAcceptances).set({ companyId }).where(and(eq(legalAcceptances.userId, userId), isNull(legalAcceptances.companyId))),
    );
  } catch (err) {
    if (!missing(err)) throw err;
  }
}

export type Acceptance = { id: string; name: string; email: string; signedName: string; role: string | null; document: string; version: string; ip: string | null; at: Date; companyId: string | null };

/** Company admin: the company's people and what each has signed. */
export async function companySignatures(tx: Tx, companyId: string) {
  const people = await tx
    .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role, status: memberships.status })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.companyId, companyId), inArray(memberships.status, ['active', 'pending'])));
  let rows: (typeof legalAcceptances.$inferSelect)[] = [];
  try {
    rows = await tx.transaction((sp) =>
      sp
        .select()
        .from(legalAcceptances)
        .where(people.length ? inArray(legalAcceptances.userId, people.map((p) => p.userId)) : eq(legalAcceptances.companyId, companyId))
        .orderBy(desc(legalAcceptances.acceptedAt)),
    );
  } catch (err) {
    if (!missing(err)) throw err;
  }
  return people
    .map((p) => {
      const mine = rows.filter((r) => r.userId === p.userId);
      const signed = (d: (typeof LEGAL_DOCS)[number]) => mine.find((r) => r.document === d.id && r.version === d.version);
      const current = LEGAL_DOCS.map(signed);
      return { ...p, signedAt: current.every(Boolean) ? current[0]!.acceptedAt : null, signedName: current[0]?.signedName ?? null };
    })
    .sort((a, b) => Number(!!a.signedAt) - Number(!!b.signedAt) || a.name.localeCompare(b.name));
}

/** Super Admin: every signature, newest first, with the company it was signed for. */
export async function allSignatures(superUserId: string, limit = 500): Promise<(Acceptance & { company: string | null })[]> {
  const db = await getDb();
  try {
    const rows = await withTenant(db, { companyId: NO_COMPANY, userId: superUserId }, (tx) =>
      tx
        .select({ a: legalAcceptances, name: users.name, email: users.email, company: companies.name })
        .from(legalAcceptances)
        .innerJoin(users, eq(users.id, legalAcceptances.userId))
        .leftJoin(companies, eq(companies.id, legalAcceptances.companyId))
        .orderBy(desc(legalAcceptances.acceptedAt))
        .limit(limit),
    );
    return rows.map((r) => ({
      id: r.a.id,
      name: r.name,
      email: r.email,
      signedName: r.a.signedName,
      role: r.a.role,
      document: r.a.document,
      version: r.a.version,
      ip: r.a.ip,
      at: r.a.acceptedAt,
      companyId: r.a.companyId,
      company: r.company,
    }));
  } catch (err) {
    if (missing(err)) return [];
    throw err;
  }
}
