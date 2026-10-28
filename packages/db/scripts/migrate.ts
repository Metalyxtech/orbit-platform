import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { fileURLToPath } from 'node:url';

// Run as the Neon owner role: DATABASE_OWNER_URL=postgres://owner:...@ep-xxx.ap-southeast-1.aws.neon.tech/neondb
const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error('DATABASE_OWNER_URL is not set');

const pool = new Pool({ connectionString: url });
await migrate(drizzle({ client: pool }), {
  migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
});
await pool.end();
console.log('Migrations applied');
