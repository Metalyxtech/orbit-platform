// Load-test data: one throwaway company with many people, and a cleanup that removes every trace.
//
//   DATABASE_OWNER_URL=... pnpm --filter @orbit/db loadtest seed 500   # company "Load Test Co" + 500 people
//   DATABASE_OWNER_URL=... pnpm --filter @orbit/db loadtest cleanup    # deletes it all again
//
// Everything it creates is marked: company slug "loadtest-…", emails "@loadtest.invalid".
// Cleanup only ever touches rows with those marks, so it cannot remove real data.
// Run it against a local database or a Neon branch made for testing, never the live one.
import pg from 'pg';

const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error('DATABASE_OWNER_URL is not set');
const [cmd, arg] = process.argv.slice(2);
const DOMAIN = 'loadtest.invalid';
const PORTALS = ['timesheet', 'procurement', 'sales', 'production', 'quality'];

const pool = new pg.Pool({ connectionString: url, max: 2 });

async function seed(people: number) {
  if (!Number.isInteger(people) || people < 1 || people > 100_000) throw new Error('Give the number of people, 1 to 100000');
  const c = await pool.connect();
  try {
    await c.query('begin');
    const slug = `loadtest-${Date.now().toString(36)}`;
    const {
      rows: [co],
    } = await c.query(
      `insert into companies (name, slug, stage, status, timezone, email_domains) values ('Load Test Co', $1, 'sandbox', 'active', 'Asia/Kolkata', $2) returning id`,
      [slug, [DOMAIN]],
    );
    // People: lt-1 is the company admin, lt-2 management, the rest employees.
    await c.query(
      `insert into users (workos_user_id, email, name)
       select 'loadtest|' || i, 'lt-' || i || '@${DOMAIN}', 'Load Test ' || i from generate_series(1, $1) i
       on conflict (email) do nothing`,
      [people],
    );
    await c.query(
      `insert into memberships (company_id, user_id, role, title, status)
       select $1, u.id,
              (case when u.email = 'lt-1@${DOMAIN}' then 'company_admin' when u.email = 'lt-2@${DOMAIN}' then 'management' else 'employee' end)::member_role,
              'Load test', 'active'
       from users u where u.email like '%@${DOMAIN}'`,
      [co.id],
    );
    for (const p of PORTALS) await c.query(`insert into company_portals (company_id, portal, enabled) values ($1, $2, true) on conflict do nothing`, [co.id, p]);
    // A long free period so the subscription check never stops the test.
    await c.query(`insert into company_billing (company_id, trial_days) values ($1, 3650) on conflict (company_id) do update set trial_days = 3650`, [co.id]).catch(() => undefined);
    await c.query('commit');
    console.log(`Seeded company ${slug} (${co.id}) with ${people} people: lt-1@${DOMAIN} (admin) … lt-${people}@${DOMAIN}`);
  } catch (err) {
    await c.query('rollback');
    throw err;
  } finally {
    c.release();
  }
}

/** Deletes every row of the load-test companies (children first, by retrying), then their people. */
async function cleanup() {
  const { rows: cos } = await pool.query(`select id, slug from companies where slug like 'loadtest-%'`);
  const { rows: tables } = await pool.query(
    `select table_name from information_schema.columns where table_schema = 'public' and column_name = 'company_id' and table_name <> 'companies'`,
  );
  for (const co of cos) {
    let left = tables.map((t) => t.table_name as string);
    // Foreign keys between tables: keep deleting what can go until nothing is left (or nothing moves).
    for (let pass = 0; left.length && pass < 20; pass++) {
      const next: string[] = [];
      for (const t of left) {
        try {
          await pool.query(`delete from "${t}" where company_id = $1`, [co.id]);
        } catch {
          next.push(t);
        }
      }
      if (next.length === left.length) throw new Error(`Could not delete from: ${next.join(', ')}`);
      left = next;
    }
    await pool.query(`delete from companies where id = $1`, [co.id]);
    console.log(`Deleted company ${co.slug}`);
  }
  const { rowCount } = await pool.query(`delete from users where email like '%@${DOMAIN}' and not exists (select 1 from memberships m where m.user_id = users.id)`);
  console.log(`Deleted ${rowCount ?? 0} load-test people. ${cos.length ? 'Done.' : 'There was no load-test company.'}`);
}

try {
  if (cmd === 'seed') await seed(Number(arg ?? 500));
  else if (cmd === 'cleanup') await cleanup();
  else console.log('Usage: loadtest seed <people> | loadtest cleanup');
} finally {
  await pool.end();
}
