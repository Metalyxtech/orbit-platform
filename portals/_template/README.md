# Portal template

Starting point for a new Orbit portal (QC, Construction, ...). A portal is a package with:

| File | What it is |
| --- | --- |
| `src/manifest.ts` | id (URL segment), name, nav items with roles, `settingsSchema` (the Company Admin settings form is generated from it), workflow kind |
| `src/server/*.ts` | business logic: plain functions `(tx, ctx, input)` that run inside the RLS transaction |
| `src/actions.ts` | `'use server'` wrappers: `runAction((tx, ctx) => ...)` |
| `src/screens/routes.tsx` | path -> screen map (server components that call `query()`), client components next to it |

## Steps

1. Copy this folder to `portals/<name>` and rename the package in `package.json` to `@orbit/portal-<name>`.
2. Add tables in `packages/db/src/schema/<name>.ts` with a `company_id` column, run `pnpm db:generate`,
   and add the table names to the RLS list in a new custom migration (`drizzle-kit generate --custom`).
3. Register the portal in `apps/web/src/portals.ts` and add the package to `transpilePackages` in `apps/web/next.config.ts`.
4. Super Admin enables it per company (`company_portals`) and binds a workflow from the library.
