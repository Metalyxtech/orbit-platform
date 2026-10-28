# Orbit platform

Orbit is a multi-company portal platform. The first portal is **Timesheet**. This repository holds
everything: the Next.js app (front end and back end), the Super Admin portal, the AWS workers and
the infrastructure as code (AWS backend + Timesheet UI).

- **Set up AWS, Neon, WorkOS and Amplify:** [docs/AWS_SETUP.md](docs/AWS_SETUP.md)
- **Region:** ap-southeast-1 (Singapore) for everything.

## Layout

```
orbit-platform/
  amplify.yml            Amplify build spec (monorepo, appRoot apps/web)
  apps/web/              Next.js 15 app: routes, auth, API routes
    app/(auth)/          sign-in, pending approval, company registration
    app/(super-admin)/   Super Admin portal (companies, stage, sandbox reset)
    app/(portal)/[portal]/  loads any enabled portal (Timesheet now)
    app/api/             health/aws, internal/timer (HMAC), webhooks/ses (SNS), exports/[id]
  packages/core/         tenancy, auth guard, portal registry, workflow engine, outbox, timers, audit
    src/aws/             credentials.ts (hosting switch), clients.ts, secrets.ts, files.ts
  packages/db/           Drizzle schema, migrations, RLS policies, seed, role setup
  packages/ui/           design system (tokens + components, Section 11)
  portals/timesheet/     portal module 1: manifest, settings schema, server logic, actions, screens
  portals/_template/     starting point for every new portal
  workers/               Lambda handlers: notifier, escalator, exporter, outbox-sweeper, company-purge
  infra/                 AWS CDK stacks (identity, storage, messaging, email, workers, ops, hosting)
  .github/workflows/     CI, deploy dev, release prod
```

## How it fits together

1. People sign in with **WorkOS AuthKit** (Microsoft, Google or email code). The app keeps its own
   encrypted session cookie; secrets come from **SSM Parameter Store** at runtime (cached 5 minutes).
2. Every server action runs in **one database transaction with row level security**:
   `SET LOCAL app.company_id` (see `packages/db/src/index.ts` `withTenant`). The `app_user` role cannot
   bypass RLS.
3. Side effects use a **transactional outbox**: events are written in the same transaction, sent to SQS after
   commit, and the **outbox-sweeper** Lambda re-sends anything left behind.
4. **Workers**: `notifier` (React Email + SES, sandbox guard, suppression list), `exporter` (.xlsx to S3),
   `company-purge`, `outbox-sweeper`, `escalator` (EventBridge Scheduler -> HMAC POST `/api/internal/timer`).
5. **Approval workflow** is data (`workflow_definitions`), bound per company by Super Admin. The default is
   *Two-level with overtime check*: supervisor, then project managers when overtime > 6 h or a day > 12 h.
   Reminder and SLA timers are one-time EventBridge schedules, deleted when a task is decided.

### Differences from the spec (and why)

| Spec | Here | Why |
| --- | --- | --- |
| One SQS queue `wepcm-*-events` for notifier, exporter and company-purge with event filters | Three queues (`-events`, `-exports`, `-purge`) sharing the DLQ | Lambda deletes SQS messages that don't match its filter, so consumers sharing a queue would lose each other's messages. The app derives the extra URLs from `APP_SQS_EVENTS_URL`; no new settings |
| Queue visibility timeout 60 s | 60 s events, 180 s exports, 360 s purge | AWS requires visibility timeout >= the consumer's timeout (120 s, 300 s) |
| Export email with a 24-hour link | The email links to `/api/exports/{id}`, which checks the session and the 24 h window, then redirects to a 5-minute pre-signed URL | A URL signed by a Lambda role's temporary credentials stops working long before 24 h |
| Exports lifecycle on `exports/` | Exporter tags objects `retention=export`; lifecycle deletes tagged objects after 7 days | Keys start with `{companyId}/`, so a prefix rule cannot match |
| `@workos-inc/authkit-nextjs` | `@workos-inc/node` + our own sealed cookie | authkit-nextjs reads secrets from env vars at build time; the spec keeps secrets in SSM |
| Neon control + tenant databases | One database for now (`neonControlUrl` = `neonTenantUrl`) | Same schema works for both; split later without code changes in portals |

## Local development

```bash
corepack enable && pnpm install
cp apps/web/.env.example apps/web/.env.local     # fill in the Neon app_user URL etc.
pnpm dev                                          # http://localhost:3000
```

With `APP_STAGE=local` and `APP_AUTH_MODE=dev`, the sign-in page lists seeded users so you can sign in
as anyone without WorkOS (never active on Amplify). `APP_SECRETS_FROM_ENV=1` reads `SECRET_*` env vars
instead of SSM.

**Plain Postgres instead of Neon** (e.g. Docker): set `DB_DRIVER=pg` for the app, migrations and seed.
The owner must be a non-superuser (like Neon's `neondb_owner`), otherwise RLS is bypassed.

```bash
export DB_DRIVER=pg DATABASE_OWNER_URL=postgres://owner:owner@localhost:5432/neondb
pnpm db:migrate && pnpm --filter @orbit/db roles && pnpm db:seed
APP_DATABASE_URL=postgres://app_user:...@localhost:5432/neondb pnpm --filter @orbit/db check-rls
```

Demo users (seed): `joseph.thomas@hekur.example` (employee), `rahul.menon@...` (supervisor),
`anita.george@...` (company admin / PM), `vivek.shenoy@...` (PM), `superadmin@orbit.local`.

### Checks

```bash
pnpm typecheck        # all packages
pnpm test             # calc, workflow, hmac, notifier guard, CDK assertions (I1, I2)
pnpm --filter web build
cd infra && npx cdk synth -c stage=dev
```

## Runbook

| Task | How |
| --- | --- |
| Deploy app (dev) | Merge to `main`. Amplify builds `apps/web`; GitHub Actions runs `cdk deploy` + migrations |
| Deploy prod | Push tag `vX.Y.Z` -> approve in GitHub (environment `production`) -> CDK, migrations, fast-forward `production` |
| Roll back the app | Amplify console > app > branch > *Deployments* > pick the previous build > *Redeploy this version* |
| Roll back infra | Revert the commit on `main` (or re-tag the previous version for prod) |
| Restore the database | Neon > *Branches* > *Restore* to a point in time (Free: 6 h, Launch: 7 days). Test on `staging` before the pilot |
| Rotate a secret | `AWS_PROFILE=wepcm-<env> ./infra/scripts/put-secrets.sh <env>`; the app picks it up within 5 minutes. For Neon passwords: `pnpm --filter @orbit/db roles` rotates and prints new URLs |
| Remove a collaborator | GitHub collaborators, IAM Identity Center user, Neon/WorkOS member; rotate any secret they could see |
| Move to Vercel Pro | [docs/AWS_SETUP.md](docs/AWS_SETUP.md#optional-later-move-hosting-to-vercel-pro-no-code-change) |
| Add a region | Add `infra/config/<region>.ts`, a Neon project in that region, deploy the stacks, and set `companies.region` |
| Add a portal | See [portals/_template/README.md](portals/_template/README.md) |
| Sandbox reset | Super Admin > *Reset sandbox data* (company-purge Lambda) |
| Seed demo company | `DATABASE_OWNER_URL=... pnpm db:seed` |

## Build status vs the 12-week plan (Section 12)

| Weeks | Deliverable | State |
| --- | --- | --- |
| 1-2 | Repo, amplify.yml, CDK identity/storage/messaging/email, WorkOS sign-in, health check | Done (needs your AWS/Neon/WorkOS accounts) |
| 3-4 | Workers stack, outbox, timers, alarms, core tables + RLS, SSM loader | Done |
| 5-6 | AppShell, WeekGrid, My week, autosave, submit, My history | Done |
| 7-8 | Approvals inbox, emails, mobile layouts, offline drafts | Done |
| 9-10 | Settings form from schema, projects/cost codes CSV, reports, exporter | Done |
| 11-12 | Prod stacks, SES production access, budgets, restore drill, pilot hand-off | Stacks + budgets done; SES access, restore drill and hand-off are manual steps |

Acceptance tests: I1 and I2 are CDK assertion tests, T1 calc tests, RLS check in CI. T2 (offline sync),
T3 (export totals = screen totals) and the timer HMAC path were verified locally against Postgres.
I3 to I6 need a deployed environment.
