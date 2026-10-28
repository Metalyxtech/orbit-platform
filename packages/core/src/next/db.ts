import { createPoolDb, type Db } from '@orbit/db';
import { getSecret } from '../aws/secrets';

let db: Promise<Db> | undefined;

/** Tenant database (Neon pooled endpoint, app_user role). URL comes from SSM. */
export function getDb(): Promise<Db> {
  db ??= getSecret('neonTenantUrl').then(createPoolDb);
  return db;
}
