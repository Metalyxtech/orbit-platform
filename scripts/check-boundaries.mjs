// Keeps the code modular: a change in one portal or package must not reach into another.
// Runs with `pnpm typecheck` (and so in CI). Fails with the offending file and import.
//
// Rules
//   portals/<name>   may import @orbit/core, @orbit/db, @orbit/ui and its own files only
//                    (never another portal, never the web app)
//   packages/<name>  may not import any portal or the web app
//   everyone         no relative import that climbs out of its own package
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const problems = [];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx|mts)$/.test(name) && !name.endsWith('.d.ts')) yield p;
  }
}

const importsOf = (code) => [...code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

function check(pkgDir, kind, own) {
  const src = join(pkgDir, 'src');
  let list;
  try {
    list = [...files(src)];
  } catch {
    return;
  }
  for (const file of list) {
    for (const spec of importsOf(readFileSync(file, 'utf8'))) {
      const where = `${relative(root, file)}: '${spec}'`;
      if (spec.startsWith('.')) {
        const target = resolve(file, '..', spec);
        if (!target.startsWith(pkgDir + sep) && target !== pkgDir) problems.push(`${where} reaches outside its package`);
        continue;
      }
      if (spec.startsWith('@/')) problems.push(`${where} imports the web app`);
      const portal = spec.match(/^@orbit\/portal-([\w-]+)/);
      if (kind === 'package' && portal) problems.push(`${where} — shared packages must not import a portal`);
      if (kind === 'portal' && portal && portal[1] !== own) problems.push(`${where} — a portal must not import another portal`);
    }
  }
}

for (const name of readdirSync(join(root, 'portals'))) {
  if (name.startsWith('_')) continue; // the template
  check(join(root, 'portals', name), 'portal', name);
}
for (const name of readdirSync(join(root, 'packages'))) check(join(root, 'packages', name), 'package', name);

if (problems.length) {
  console.error(`Module boundary check failed (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('Module boundaries OK');
