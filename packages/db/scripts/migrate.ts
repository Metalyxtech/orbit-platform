import { migrate as migrateNeon } from 'drizzle-orm/neon-serverless/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { createPoolDb } from '../src';

// Run as the Neon owner role: DATABASE_OWNER_URL=postgres://neondb_owner:...@ep-xxx.ap-southeast-1.aws.neon.tech/neondb
const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error('DATABASE_OWNER_URL is not set');

const db = createPoolDb(url);
const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
await (process.env.DB_DRIVER === 'pg' ? migratePg(db as any, { migrationsFolder }) : migrateNeon(db, { migrationsFolder }));
await db.$client.end();
console.log('Migrations applied');
