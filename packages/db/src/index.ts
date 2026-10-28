import { neon, Pool } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import * as schema from './schema';

export { schema };
export * from './schema';

/** DB_DRIVER=pg: plain Postgres over TCP (local development and integration tests). */
const usePg = () => process.env.DB_DRIVER === 'pg';

function createPgDb(connectionString: string) {
  return drizzlePg({ client: new pg.Pool({ connectionString, max: 5 }), schema });
}

/** Pooled (WebSocket) client for the Next.js server. Supports interactive transactions. */
export function createPoolDb(connectionString: string) {
  if (usePg()) return createPgDb(connectionString) as unknown as ReturnType<typeof createNeonPoolDb>;
  return createNeonPoolDb(connectionString);
}

function createNeonPoolDb(connectionString: string) {
  const pool = new Pool({ connectionString, max: 5 });
  return drizzlePool({ client: pool, schema });
}

/** HTTP client for Lambda workers: no connection to keep open. */
export function createHttpDb(connectionString: string) {
  if (usePg()) return createPgDb(connectionString) as unknown as ReturnType<typeof createNeonHttpDb>;
  return createNeonHttpDb(connectionString);
}

function createNeonHttpDb(connectionString: string) {
  return drizzleHttp({ client: neon(connectionString), schema });
}

export type Db = ReturnType<typeof createPoolDb>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Anything that can run queries: the app's RLS transaction or a worker's HTTP client. */
export type Queryable = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
export type HttpDb = ReturnType<typeof createHttpDb>;

export interface TenantScope {
  companyId: string;
  userId: string;
}

/**
 * Runs fn inside a transaction with row level security scoped to one company.
 * Every tenant query in the app must go through here (Section 9: SET LOCAL app.company_id).
 */
export async function withTenant<T>(db: Db, scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.company_id', ${scope.companyId}, true), set_config('app.user_id', ${scope.userId}, true)`,
    );
    return fn(tx);
  });
}
