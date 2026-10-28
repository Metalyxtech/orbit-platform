# AWS setup, step by step (testing stage, `orbit-dev`)

This sets up the testing environment: AWS, Neon, WorkOS and
Amplify Hosting. Do it once. It takes about 1 to 2 hours. Everything runs in **ap-southeast-1 (Singapore)**.

When you finish, you will have:

```
GitHub (orbit-platform) --push--> Amplify (Next.js app) --compute role--> S3, SQS, Scheduler, SSM
                                         |                                  |
                                       Neon (Postgres)  <----------------  5 Lambdas -> SES email
```

You need: the company **info@** email, a phone for MFA, Node.js 22, and `pnpm` (`corepack enable`).

---

## Part A. AWS accounts (15 min)

1. **Create the AWS account** at <https://aws.amazon.com> using **info@**. This is the *management* account.
   - Turn on **MFA** for the root user (top right > Security credentials > Assign MFA).
   - Never create access keys for root.
2. **Create the testing account.** Console > **AWS Organizations** > *Create an organization* >
   *Add an AWS account* > *Create*. Name: `orbit-dev`, email: e.g. `info+dev@yourcompany.com`.
   (Later, for pilot: do the same for `orbit-prod`.)
3. **Sign-in for people.** Console > **IAM Identity Center** (region **Singapore**) > *Enable*.
   - *Users* > add yourself (and each developer).
   - *Permission sets* > create `AdministratorAccess` (you), `PowerUserAccess` (developers, dev only),
     `ReadOnlyAccess` (developers, prod).
   - *AWS accounts* > tick `orbit-dev` > *Assign users* > choose the user + permission set.
4. **Set up the AWS CLI** on your computer:
   ```bash
   aws configure sso --profile orbit-dev
   ```
   Use the *AWS access portal URL* shown on the IAM Identity Center dashboard, region `ap-southeast-1`,
   pick the `orbit-dev` account and `AdministratorAccess`. Check it works:
   ```bash
   aws sts get-caller-identity --profile orbit-dev
   ```
5. **Budget alert:** the CDK deploy below creates a $5/month budget with email alerts. Nothing to do now.

## Part B. Neon database (10 min)

1. Sign up at <https://neon.tech> with **info@**. Create project **`west-epcm-ap-sg`**,
   region **AWS Asia Pacific (Singapore)**, Postgres **17**.
2. On the project dashboard click *Connect*, copy the **owner** connection string
   (`postgresql://neondb_owner:...@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`).
3. In a terminal at the repository root:
   ```bash
   pnpm install
   export DATABASE_OWNER_URL='postgresql://neondb_owner:...'   # the string from step 2
   pnpm db:migrate                       # tables + row level security
   pnpm --filter @orbit/db roles         # prints app_user / worker / reports_ro connection strings: copy them
   pnpm db:seed                          # workflow library + demo company "Hekur Contractors"
   ```
   Keep the three printed connection strings for Part D. (For production, use `SEED_DEMO=0 pnpm db:seed`.)
4. Settings > *Compute*: autoscaling **0.25 to 0.5 CU**, scale to zero **on** (Section 1.4).

## Part C. WorkOS sign-in (10 min)

1. Sign up at <https://workos.com> with **info@**. Open the **Staging** environment.
2. *Authentication*: turn on **Google OAuth**, **Microsoft OAuth** and **Email + code** (Magic Auth).
3. *Redirects*: add `http://localhost:3000/auth/callback` now. You add the Amplify URL in Part E.
4. *API Keys*: copy the **Client ID** (`client_...`) and the **API key** (`sk_test_...`).

## Part D. Deploy the AWS backend with CDK (20 min)

1. Edit **`infra/config/dev.ts`**:
   - `githubOwner`: the GitHub owner of `orbit-platform`.
   - `alarmEmail`: where alarms and budget emails go.
   - Leave `appBaseUrl` as is for now (you get the URL in Part E).
2. Bootstrap CDK once per account and region (use your account id from `aws sts get-caller-identity`):
   ```bash
   cd infra
   npx cdk bootstrap aws://<DEV_ACCOUNT_ID>/ap-southeast-1 --profile orbit-dev
   ```
3. Deploy everything (7 stacks: Identity, Storage, Messaging, Email, Workers, Ops, Hosting):
   ```bash
   npx cdk deploy --all -c stage=dev --profile orbit-dev
   ```
   Answer `y` to the IAM changes prompt. At the end, **keep the Outputs**, especially:
   - `OrbitDevHosting.ComputeRoleArn`
   - `OrbitDevHosting.AmplifyEnvironmentVariables`
   - `OrbitDevIdentity.GithubDeployRoleArn`
4. Confirm the **alarm email** subscription (AWS sends you a "Subscription Confirmation" email).
5. Store the secrets in SSM Parameter Store (SecureString). The script asks for each value:
   ```bash
   AWS_PROFILE=orbit-dev ./infra/scripts/put-secrets.sh dev
   ```
   | It asks for | Paste |
   | --- | --- |
   | Neon app_user POOLED connection string | `app_user` URL from Part B (contains `-pooler`) |
   | Neon app_user ... (control) | the same `app_user` URL |
   | WorkOS API key | `sk_test_...` from Part C |
   | Cookie password | press Enter (it generates one) |
   | Neon worker connection string | `worker` URL from Part B |
   | From address | e.g. `notifications@mail.example.com` (or a verified tester address while in the SES sandbox) |
   | Sandbox allowlist | tester emails, comma separated, e.g. `you@company.com,*@company.com` |
   | Neon OWNER connection string | the owner URL (used only by the pipeline for migrations) |

## Part E. Amplify Hosting (15 min)

1. Console (account `orbit-dev`, region Singapore) > **AWS Amplify** > *Create new app* > **GitHub**.
   Sign in as the **info@** GitHub account and allow the Amplify GitHub App for `orbit-platform` only.
2. Repository `orbit-platform`, branch **`main`**. Tick **"My app is a monorepo"**, root directory **`apps/web`**.
3. Build settings: Amplify reads **`amplify.yml`** from the repository. Under *Advanced settings*:
   - *Build image*: Amazon Linux 2023, **Node.js 22**.
   - *Environment variables*: add each `KEY=value` from `OrbitDevHosting.AmplifyEnvironmentVariables`, plus
     `NEXT_PUBLIC_WORKOS_CLIENT_ID=client_...`. Only non-secret values go here.
4. *Service role*: let Amplify create the default one (CloudWatch logging).
5. *Save and deploy*. When it finishes, copy the URL, e.g. `https://main.d1abcd2345.amplifyapp.com`.
6. *App settings > IAM roles > **Compute role***: choose **`orbit-dev-app`** > Save. Then *Redeploy this version*.
7. Point everything at the real URL:
   - Amplify env var `APP_BASE_URL` = the URL.
   - `infra/config/dev.ts` > `appBaseUrl` = the URL, and add it to `corsOrigins`. Redeploy CDK:
     `npx cdk deploy --all -c stage=dev --profile orbit-dev` (this also subscribes the SES webhook).
   - WorkOS > *Redirects*: add `https://<url>/auth/callback`; *Sign-out redirect*: `https://<url>`.
8. Optional: *Branch auto-detection* for `feature/*` with *Access control* (password) on non-production branches;
   *Notifications*: build failure emails to you and info@; *Custom domain*: `test.<company-domain>`.

### Week-1 check (do this before any feature work)

Open **`https://<url>/api/health/aws`**. Expected:
```json
{ "hosting": "amplify", "stage": "dev", "region": "ap-southeast-1", "s3": "ok", "ssm": "ok" }
```
If `s3` or `ssm` is not `ok`, the compute role is not attached (Part E step 6) or a secret is missing (Part D step 5).

## Part F. Email with SES (10 min, then DNS wait)

While testing, SES is in the **sandbox**: it only sends to verified addresses.
1. Console > **Amazon SES** > *Identities* > *Create identity* > *Email address*, for each tester. Click the link in each email.
2. When you can edit DNS for the company domain: set `mailDomain: 'mail.example.com'` in `infra/config/dev.ts`,
   redeploy CDK, and add the DNS records printed in the `OrbitDevEmail` outputs (3 DKIM CNAMEs, MAIL FROM MX + SPF TXT, DMARC TXT).
3. Before the first pilot company: SES > *Account dashboard* > **Request production access**
   (use case: transactional workflow emails).

## Part G. GitHub Actions (5 min)

1. GitHub > `orbit-platform` > *Settings* > *Secrets and variables* > *Actions* > **Variables**:
   `AWS_DEPLOY_ROLE_DEV` = `OrbitDevIdentity.GithubDeployRoleArn`. (No AWS keys are stored anywhere.)
2. From now on:
   - Pull request: type-check, tests, build, CDK synth, migrations + RLS check on a throwaway Postgres.
   - Merge to `main`: CDK deploy to `orbit-dev`, migrations on Neon; Amplify deploys the app by itself.

## Part H. First sign-in and Super Admin (5 min)

1. Open the app, click *Continue*, sign in with your company Google/Microsoft account or an email code.
2. Make yourself Super Admin. In the Neon console > *SQL Editor* (owner role):
   ```sql
   UPDATE users SET is_super_admin = true WHERE email = 'you@yourcompany.com';
   ```
3. Open `/super-admin` to approve registered companies and set their stage (sandbox / pilot / live).
   To try the demo company, add yourself to it:
   ```sql
   INSERT INTO memberships (company_id, user_id, role, title, status)
   SELECT c.id, u.id, 'company_admin', 'Company admin', 'active'
   FROM companies c, users u WHERE c.slug = 'hekur-contractors' AND u.email = 'you@yourcompany.com';
   ```

---

## Later: production account (`orbit-prod`)

Same steps with `prod` instead of `dev`: create the account (A2), assign `ReadOnlyAccess` to developers, a new Neon
branch or project on the **Launch** plan, `cdk bootstrap` + `npx cdk deploy --all -c stage=prod`,
`put-secrets.sh prod`, a second Amplify app `orbit-prod-web` on branch **`production`** with compute role
`orbit-prod-app`. Add GitHub variable `AWS_DEPLOY_ROLE_PROD` and an environment **`production`** with required
reviewers. Releasing = pushing a tag `v1.0.0`: the pipeline waits for approval, deploys, migrates and
fast-forwards `production`.

## Optional later: move hosting to Vercel Pro (no code change)

1. `npx cdk deploy OrbitProdIdentity -c stage=prod -c enableVercel=true -c vercelTeamSlug=<team>`
2. In Vercel: import `orbit-platform`, root `apps/web`, function region `sin1`; set `HOSTING=vercel`,
   `APP_ROLE_ARN=<orbit-prod-app ARN>` and the same `APP_*` variables.
3. Test the preview URL (sign in, upload, submit a timesheet, receive an email), then move DNS.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/api/health/aws` shows `CredentialsProviderError` | Compute role not attached: Amplify > App settings > IAM roles |
| `ssm: ParameterNotFound` | Run `put-secrets.sh dev` again; names are `/orbit/dev/app/*` |
| Sign-in loops back to `/sign-in` | WorkOS redirect URI must be exactly `https://<url>/auth/callback`; `APP_BASE_URL` must match |
| No emails | SES sandbox: verify the recipient; check `sandboxAllowlist`; see CloudWatch log group `/aws/lambda/orbit-dev-notifier` |
| Alarm `dlq-not-empty` | A message failed 5 times. Read it in SQS > `orbit-dev-events-dlq` > *Send and receive messages* |
| Amplify build fails on `pnpm install` | `.npmrc` must contain `node-linker=hoisted` (it does); Node 22 build image |
