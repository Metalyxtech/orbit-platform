# Custom portal 1

A portal built for **one customer**, kept completely separate from the normal portals
(`portals/timesheet`, `portals/procurement`). Changing code here never changes them.

## How a custom job flows
1. Any company admin asks for a custom portal in **Company admin > Custom portals** (or from
   Company portals > "Request a custom portal") and uploads their forms (images or PDF).
2. Super Admin opens **Custom work**, replies, and sets the price on the Company page > Custom work
   (one price covering their normal portals plus the custom portal).
3. Super Admin downloads the files from **Custom work** and hands them to a developer.
4. The developer builds the forms and workflow **in this folder** (see below).
5. Super Admin switches the portal on for that company (Company page > Portals > Custom portal).

## Building in this folder
| What | Where |
| --- | --- |
| Portal name, menu | `src/manifest.ts` (`name`, `nav`) |
| Screens | `src/screens/*.tsx`, listed in `src/screens/routes.tsx` (path -> screen) |
| Business logic | `src/server/*.ts`: plain functions `(tx, ctx, input)` that run inside the company's RLS transaction |
| Server actions | `src/actions.ts` with `runAction((tx, ctx) => ...)` |
| Tables | `packages/db/src/schema/custom1.ts`, every table with `company_id` and named `custom1_*`, plus a migration that adds them to row-level security |

Rules that keep it separate:
- Only import from `@orbit/core`, `@orbit/db` and `@orbit/ui`. Never import from another portal.
- Table names start with `custom1_`; never change another portal's tables.
- `custom: true` in the manifest keeps it out of sign-up, standard plans and portal requests.

## A second custom customer
Copy this folder to `portals/custom-2`, rename the package to `@orbit/portal-custom-2`, the manifest
id to `custom-2` and the exports to `custom2...`, then register it in `apps/web/src/portals.ts`
and `apps/web/next.config.ts` (`transpilePackages`) and add it to `apps/web/package.json`.
