import { asc, eq } from 'drizzle-orm';
import { getDb } from '@orbit/core/next';
import { companies } from '@orbit/db';

/** Companies a signed-in person can ask to join: active ones, by name. Names only, no other details. */
export async function joinableCompanies() {
  const db = await getDb();
  return db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.status, 'active')).orderBy(asc(companies.name));
}

/** One active company by id, or undefined. */
export async function activeCompany(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(companies).where(eq(companies.id, id));
  return row?.status === 'active' ? row : undefined;
}
