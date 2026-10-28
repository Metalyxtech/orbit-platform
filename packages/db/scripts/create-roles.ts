import { Pool } from '@neondatabase/serverless';
import { randomBytes } from 'node:crypto';

/**
 * Creates (or rotates the password of) the three login roles from Section 9 and prints
 * their connection strings. Run once per Neon branch, as the owner, after `pnpm db:migrate`:
 *   DATABASE_OWNER_URL=... pnpm --filter @orbit/db roles
 * Put the printed URLs in SSM (see docs/AWS_SETUP.md), never in git.
 */
const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) throw new Error('DATABASE_OWNER_URL is not set');

const roles = [
  { name: 'app_user', group: 'orbit_app', pooled: true, extra: 'NOBYPASSRLS' },
  { name: 'worker', group: 'orbit_worker', pooled: false, extra: '' },
  { name: 'reports_ro', group: 'orbit_reports', pooled: true, extra: 'NOBYPASSRLS' },
];

const pool = new Pool({ connectionString: ownerUrl });
for (const role of roles) {
  const password = randomBytes(24).toString('base64url');
  const { rows } = await pool.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role.name]);
  const verb = rows.length ? 'ALTER' : 'CREATE';
  await pool.query(`${verb} ROLE ${role.name} LOGIN ${role.extra} PASSWORD '${password}'`);
  await pool.query(`GRANT ${role.group} TO ${role.name}`);

  const url = new URL(ownerUrl);
  url.username = role.name;
  url.password = password;
  if (role.pooled && !url.hostname.includes('-pooler')) {
    url.hostname = url.hostname.replace(/^([^.]+)/, '$1-pooler');
  }
  console.log(`${role.name}: ${url.toString()}`);
}
await pool.end();
