import { sql } from 'drizzle-orm';
import { createPoolDb, timesheets, projects, withTenant } from '../src';

/**
 * Tenant isolation check (run in CI after migrate + seed), as app_user:
 * APP_DATABASE_URL=postgres://app_user:...  pnpm --filter @orbit/db check-rls
 */
const db = createPoolDb(process.env.APP_DATABASE_URL ?? '');
const fail = (msg: string) => {
  console.error('RLS CHECK FAILED:', msg);
  process.exit(1);
};

const [{ bypass }] = (await db.execute(sql`select rolbypassrls as bypass from pg_roles where rolname = current_user`)).rows as { bypass: boolean }[];
if (bypass) fail('app_user has BYPASSRLS');

const unscoped = await db.select().from(timesheets);
if (unscoped.length !== 0) fail(`unscoped query saw ${unscoped.length} timesheets`);

const companies = (await db.execute(sql`select id from companies`)).rows as { id: string }[];
if (companies.length === 0) fail('no companies seeded');
const user = '00000000-0000-0000-0000-000000000000';
const own = await withTenant(db, { companyId: companies[0].id, userId: user }, (tx) => tx.select().from(timesheets));
if (own.length === 0) fail('scoped query saw no timesheets');
if (own.some((t) => t.companyId !== companies[0].id)) fail('scoped query saw another company');

const other = await withTenant(db, { companyId: '00000000-0000-0000-0000-000000000001', userId: user }, (tx) => tx.select().from(timesheets));
if (other.length !== 0) fail('another company saw rows');

try {
  await withTenant(db, { companyId: '00000000-0000-0000-0000-000000000001', userId: user }, (tx) =>
    tx.insert(projects).values({ companyId: companies[0].id, code: 'RLS', name: 'cross tenant' }),
  );
  fail('cross-tenant insert was allowed');
} catch (err) {
  const text = `${err} ${(err as { cause?: unknown }).cause ?? ''}`;
  if (!text.includes('row-level security')) throw err;
}
console.log('RLS check passed');
await db.$client.end();
