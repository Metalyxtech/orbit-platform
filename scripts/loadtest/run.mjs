// Load generator (no dependencies): many visitors requesting pages at once, then a speed report.
//
// Public pages only (safe on any site, adds no data):
//   node scripts/loadtest/run.mjs --base https://your-site --paths /sign-in,/pricing --concurrency 20 --seconds 30
//
// Signed-in pages, against a LOCAL production build with dev sign-in (APP_STAGE=local, APP_AUTH_MODE=dev)
// and people from `pnpm --filter @orbit/db loadtest seed 500`:
//   node scripts/loadtest/run.mjs --base http://localhost:3000 --people 500 --paths /,/timesheet --concurrency 50 --seconds 60
//
// Each visitor signs in as a different seeded person (lt-N@loadtest.invalid) through the local dev cookie.
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const base = (args.base ?? 'http://localhost:3000').replace(/\/$/, '');
const paths = (args.paths ?? '/').split(',');
const concurrency = Number(args.concurrency ?? 20);
const seconds = Number(args.seconds ?? 30);
const people = Number(args.people ?? 0);

const times = [];
const statuses = {};
let errors = 0;
const end = Date.now() + seconds * 1000;

async function visitor(n) {
  // Spread visitors over the seeded people (admin is lt-1); public mode sends no cookie.
  const cookie = people ? `orbit_dev_user=lt-${(n % people) + 1}@loadtest.invalid` : undefined;
  let i = n;
  while (Date.now() < end) {
    const path = paths[i++ % paths.length];
    const t = performance.now();
    try {
      const res = await fetch(base + path, { headers: cookie ? { cookie } : {}, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
      await res.arrayBuffer();
      statuses[res.status] = (statuses[res.status] ?? 0) + 1;
      if (res.status >= 500) errors++;
    } catch {
      errors++;
      statuses.failed = (statuses.failed ?? 0) + 1;
    }
    times.push(performance.now() - t);
  }
}

console.log(`Load test: ${concurrency} visitors for ${seconds}s on ${base} (${paths.join(', ')})${people ? `, as ${people} seeded people` : ''}`);
await Promise.all(Array.from({ length: concurrency }, (_, n) => visitor(n)));
times.sort((a, b) => a - b);
const pct = (p) => (times.length ? Math.round(times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))]) : 0);
console.log(`Requests: ${times.length} (${(times.length / seconds).toFixed(1)} per second)`);
console.log(`Response time: median ${pct(50)} ms, 95% under ${pct(95)} ms, 99% under ${pct(99)} ms, slowest ${Math.round(times.at(-1) ?? 0)} ms`);
console.log(`Status codes: ${JSON.stringify(statuses)}  Errors: ${errors} (${times.length ? ((errors / times.length) * 100).toFixed(2) : 0}%)`);
