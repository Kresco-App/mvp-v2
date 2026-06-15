# Production Pipeline Setup Guide

Last audited: 2026-06-05

This guide turns the current Kresco repo into a production deployment pipeline. It is intentionally explicit about every environment, secret, service, and gate. Do not paste real secret values into this file, GitHub issues, PR comments, screenshots, or chat.

## 0. Current State

This is the current setup observed from the local repo and connected CLIs.

### Already Present

- Backend CI exists: `.github/workflows/ci-backend.yml`
- Frontend CI exists: `.github/workflows/ci-frontend.yml`
- Backend deploy workflow exists: `.github/workflows/deploy-backend.yml`
- Frontend deploy workflow exists: `.github/workflows/deploy-frontend.yml`
- Manual staging launch evidence workflow exists: `.github/workflows/staging-launch-evidence.yml`
- Tracked-file secret hygiene scan passes locally without printing secret values:
  - `python scripts/check_secret_hygiene.py`
- Repo hygiene scan passes locally:
  - `python scripts/check_repo_hygiene.py`
- Vercel project is linked:
  - project: `mvp-v2`
  - production URL: `https://kresco.ma`
- Read-only Vercel inspection found a READY production deployment from 2026-06-02 with public alias `https://mvp-v2-theta.vercel.app`.
- Frontend production deploy workflow runs a post-deploy production-surface scan against the captured Vercel deployment URL and every configured public production alias in `FRONTEND_PRODUCTION_BASE_URLS`.
- Backend deploy workflow runs S3 media posture verification after staging runtime verification.
- Production deploy workflows run the structured secret rotation checklist gate before the launch gate.
- Backend CI path filters include the workflow files inspected by backend tests.
- Staging launch evidence collectors use a redacting wrapper with strict JSON validation for JSON-producing collectors and pre-upload artifact completeness checks.
- `staging` GitHub Environment exists with some backend deploy secrets and vars.

### Missing Or Not Yet Production-Ready

- Production launch gate currently fails:
  - `python scripts/check_production_launch_gate.py --json`
  - current score: `5.5/10`
  - target score: `9/10`
- Production GitHub Environment is not fully populated.
- Production GitHub Environment has no required reviewer protection.
- AWS CLI is not configured locally, so AWS Secrets Manager, RDS, S3, CloudWatch, and Lambda cannot yet be verified from this machine.
- AWS Secrets Manager runtime secret contents have not been verified.
- Local AWS/staging evidence collection is unavailable from this machine:
  - `aws sts get-caller-identity` exits `255`
  - MEDIA/OPS/PERF/RT collectors fail closed on missing AWS credentials or required staging inputs.
- Local ignored-env secret hygiene currently fails closed without printing secret values:
  - `python scripts/check_secret_hygiene.py --include-local-env`
  - current redacted finding: `frontend/.env.inspect` contains a JWT/OIDC-token-shaped `VERCEL_OIDC_TOKEN` value.
- Provider-side secret rotation evidence is incomplete:
  - `python scripts/check_secret_hygiene.py --include-local-env --require-rotation-checklist`
  - currently fails on the local ignored-env token finding and structured placeholder rotation evidence.
- The manual staging launch evidence workflow is expected to fail until all staging variables, secrets, AWS permissions, realtime auth tokens, and runbook drill evidence are populated.
- Production frontend scanner has reached a public production alias but does not pass:
  - `npm run check:production-demo-surface -- --base-url https://mvp-v2-theta.vercel.app --json`
  - result: 13 routes and 25 same-origin text assets fetched, 0 demo/local findings, but `/onboarding` returns HTTP 404.
  - local repo inspection confirms `frontend/app/onboarding/page.tsx` exists and `/onboarding` is an intentional scanner route; the failure indicates the deployed alias is stale, built from the wrong root, or otherwise not serving the current frontend route set.
  - `https://kresco.ma` and `https://www.kresco.ma` did not resolve from this environment during the latest check.
- GitHub Actions evidence for remote `master` is partial/stale for the dirty local workspace:
  - latest staging diagnostics, NAT egress, and realtime recovery runs passed on 2026-06-02.
  - latest backend deploy run failed post-deploy runtime verification after an earlier successful deploy.
  - no fanout-50 provider run, frontend deploy scanner pass, or completed runbook drill evidence was found.
- Vercel Preview currently contains local/demo flags that should not be used for production-like staging.
- Production rollback, restore, and incident drills still need staging evidence.

## 1. Target Architecture

Production shape:

```text
User browser
  -> Vercel Next.js frontend
  -> /api rewrite or HTTPS API base
  -> API Gateway
  -> AWS Lambda FastAPI backend via Zappa
  -> RDS PostgreSQL through RDS Proxy
  -> S3 private media bucket
  -> Ably, VdoCipher, Stripe, Resend, Google OAuth
```

The frontend deploys to Vercel. The backend deploys to AWS Lambda. The backend loads runtime secrets from AWS Secrets Manager using `KRESCO_RUNTIME_SECRET_ID`.

## 2. Environment Model

Create and maintain exactly these logical environments:

| Environment | Purpose | Real Users | Real Money | Separate Secrets |
| --- | --- | --- | --- | --- |
| `local` | Developer machines only | No | No | Local fake/test values |
| `staging` | Production rehearsal | No | Stripe test mode only | Yes |
| `production` | Real users | Yes | Stripe live mode | Yes |

Rules:

1. Never reuse production secrets in staging or local.
2. Keep the same secret names in staging and production, but use different values.
3. Use lowercase GitHub Environment names: `staging` and `production`.
4. Production deploys must require manual approval.
5. Production deploys must stay blocked until `python scripts/check_production_launch_gate.py` passes.

## 3. GitHub Environments

Go to:

```text
GitHub repo -> Settings -> Environments
```

Create or normalize these environments:

```text
staging
production
```

Important: the deploy workflows use `environment: ${{ inputs.stage }}` and `environment: ${{ inputs.environment }}` with input values `staging` and `production`. Use those exact lowercase names to avoid operator confusion.

### Current GitHub Environment Snapshot

Observed `staging` secrets:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
DATABASE_URL
REALTIME_OUTBOX_SECRET
```

Observed `staging` vars:

```text
BACKEND_READY_URL
CORS_ALLOWED_ORIGINS
CORS_ALLOW_ORIGIN_REGEX
FRONTEND_URL
KRESCO_RUNTIME_SECRET_ID
```

Observed production-like environment currently named `Production` has only:

```text
CORS_ALLOWED_ORIGINS
FRONTEND_URL
```

Action: create or normalize the canonical lowercase `production` environment and copy the production URL vars there before adding secrets.

### Production Protection Rules

For the `production` environment:

1. Enable required reviewers.
2. Add at least one owner who understands deploy, database migration, and rollback risk.
3. If GitHub plan supports it, prevent self-review for deploy approvals.
4. Do this before adding production secrets.

Reason: GitHub does not expose environment secrets to jobs that wait for approval until the environment is approved.

## 4. GitHub Environment Secrets

Add these secrets to both `staging` and `production`.

| Secret | Environment | Source | Used By | Notes |
| --- | --- | --- | --- | --- |
| `AWS_ACCESS_KEY_ID` | staging, production | AWS IAM | Backend deploy | Prefer a least-privilege deploy principal. Future improvement: GitHub OIDC. |
| `AWS_SECRET_ACCESS_KEY` | staging, production | AWS IAM | Backend deploy | Rotate if ever pasted or stored locally. |
| `DATABASE_URL` | staging, production | AWS RDS Proxy | Backend deploy migrations and VPC resolution | Must point at RDS Proxy and include `sslmode=verify-full`. |
| `REALTIME_OUTBOX_SECRET` | staging, production | Generate random value | Runtime diagnostics and outbox recovery | Minimum 32 chars. Must match AWS runtime secret value. |
| `VERCEL_TOKEN` | staging, production | Vercel account/team token | Frontend deploy | Needed by `vercel pull`, `vercel build`, and `vercel deploy`. |
| `VERCEL_ORG_ID` | staging, production | Vercel linked project | Frontend deploy | Current linked org ID is visible in `frontend/.vercel/project.json`. |
| `VERCEL_PROJECT_ID` | staging, production | Vercel linked project | Frontend deploy | Current linked project ID is visible in `frontend/.vercel/project.json`. |

Recommended cleanup:

1. Keep deploy secrets environment-scoped.
2. Remove or stop relying on repo-level deploy secrets once `staging` and `production` are complete.
3. Do not store backend runtime provider secrets directly in Vercel.

## 5. GitHub Environment Vars

Add these vars to `staging` and `production`.

| Variable | staging Value | production Value | Notes |
| --- | --- | --- | --- |
| `FRONTEND_URL` | staging Vercel URL | `https://kresco.ma` | Backend uses this for redirects/cookies/payment return URLs. |
| `FRONTEND_PRODUCTION_BASE_URLS` | optional preview aliases | `https://kresco.ma,https://www.kresco.ma,https://mvp-v2-theta.vercel.app` | Production frontend deploy fails unless these public aliases are scanned after deploy. |
| `CORS_ALLOWED_ORIGINS` | staging frontend origins | `https://kresco.ma,https://www.kresco.ma` | No localhost in production. |
| `CORS_ALLOW_ORIGIN_REGEX` | `^$` unless tightly scoped | `^$` unless tightly scoped | Do not allow wildcard regex. |
| `BACKEND_READY_URL` | staging `/ready` URL | production `/ready` URL | Example shape: `https://...execute-api.eu-west-3.amazonaws.com/staging/ready`. |
| `KRESCO_RUNTIME_SECRET_ID` | staging AWS secret ARN | production AWS secret ARN | Must be full AWS Secrets Manager ARN. |
| `ZAPPA_SUBNET_IDS` | optional | optional | Comma-separated subnet IDs if auto-resolution is not enough. |
| `ZAPPA_SECURITY_GROUP_IDS` | optional | optional | Comma-separated security group IDs if auto-resolution is not enough. |
| `CLOUDWATCH_ALARM_NAMES` | optional | required | Production backend deploy requires at least four alarm names. |
| `RDS_DB_CLUSTER_IDENTIFIER` | optional | required if Aurora/cluster | Used for pre-migration snapshot. |
| `RDS_DB_INSTANCE_IDENTIFIER` | optional | required if non-cluster RDS | Used for pre-migration snapshot. |

Production must set either `RDS_DB_CLUSTER_IDENTIFIER` or `RDS_DB_INSTANCE_IDENTIFIER`.

## 6. AWS Services To Create

Create separate staging and production resources. Do not point staging at production storage or production database.

### 6.1 AWS IAM Deploy Principal

Current workflows expect static AWS access keys:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

Create a least-privilege IAM user or role for GitHub deploys with access to:

- Lambda and Zappa deployment resources
- API Gateway resources used by Zappa
- CloudWatch logs and alarms
- EventBridge scheduled rules for realtime outbox worker
- RDS snapshot creation and wait operations
- RDS metadata needed by deploy scripts
- Secrets Manager `GetSecretValue` for the stage runtime secret
- S3 access for Lambda deployment artifacts if Zappa uses an S3 bucket
- EC2 VPC metadata if subnet/security group resolution is needed

Do not use the AWS root account. Rotate keys if they were ever copied into local files, shell history, screenshots, or chat.

### 6.2 RDS PostgreSQL And RDS Proxy

Create separate databases or clusters:

```text
kresco-staging
kresco-production
```

Create separate RDS Proxy endpoints:

```text
kresco-staging-proxy
kresco-production-proxy
```

The deployed `DATABASE_URL` must:

1. Use PostgreSQL.
2. Point at the RDS Proxy hostname, not a local DB.
3. Include `sslmode=verify-full`.
4. Use a hostname, not an IP address.

Example shape only:

```text
postgresql+asyncpg://USER:PASSWORD@PROXY_HOST:5432/DB_NAME?sslmode=verify-full
```

Do not commit the real URL.

### 6.3 S3 Media Storage

Create separate bucket strategy:

Preferred:

```text
kresco-staging-media
kresco-production-media
```

Acceptable:

```text
one private bucket with separate prefixes:
staging/
production/
```

Required bucket posture:

1. Block Public Access enabled.
2. No public read bucket policy.
3. Lifecycle rules installed.
4. Anonymous direct object GET must fail.
5. Authenticated app request must return short-lived presigned URL.

Runtime values:

```text
MEDIA_STORAGE_BACKEND=s3
MEDIA_S3_BUCKET=<bucket-name>
MEDIA_S3_REGION=eu-west-3
MEDIA_S3_PREFIX=staging or production
MEDIA_S3_PRESIGN_TTL_SECONDS=3600
MEDIA_PROFILE_QUOTA_BYTES=10485760
MEDIA_CHAT_CONVERSATION_QUOTA_BYTES=52428800
MEDIA_S3_LIFECYCLE_EXPIRATION_DAYS=365
```

### 6.4 AWS Secrets Manager Runtime Secrets

Create two AWS Secrets Manager JSON secrets:

```text
kresco/staging/runtime
kresco/production/runtime
```

Copy each full ARN into GitHub Environment var `KRESCO_RUNTIME_SECRET_ID`.

Each secret must contain this JSON object shape. Values below are placeholders only:

```json
{
  "DATABASE_URL": "",
  "JWT_SECRET_KEY": "",
  "GOOGLE_CLIENT_ID": "",
  "VDOCIPHER_API_SECRET": "",
  "VDOCIPHER_API_BASE_URL": "https://dev.vdocipher.com/api",
  "VDOCIPHER_LIVE_CREATE_URL": "",
  "STRIPE_SK": "",
  "STRIPE_PRODUCT_ID": "",
  "STRIPE_WEBHOOK_SECRET": "",
  "RESEND_API_KEY": "",
  "ABLY_API_KEY": "",
  "REALTIME_OUTBOX_SECRET": "",
  "MEDIA_S3_BUCKET": ""
}
```

Notes:

1. `DATABASE_URL` here should match the GitHub Environment `DATABASE_URL` secret for the same environment.
2. `REALTIME_OUTBOX_SECRET` here should match the GitHub Environment `REALTIME_OUTBOX_SECRET` secret for the same environment.
3. `JWT_SECRET_KEY` must be non-default and at least 32 characters.
4. `STRIPE_SK` must be test-mode for staging and live-mode for production.
5. `STRIPE_WEBHOOK_SECRET` must come from the exact webhook endpoint for that environment.

Generate random internal secrets locally with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Use the generated output only in the secret manager or GitHub secret UI. Do not store it in a tracked file.

## 7. External Provider Setup

### 7.1 Vercel

Current linked project:

```text
kresco-s-projects/mvp-v2
```

Current production URL:

```text
https://kresco.ma
```

Required GitHub deploy secrets:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

How to obtain:

1. Create a Vercel token from the Vercel dashboard.
2. Confirm project link from `frontend/.vercel/project.json`.
3. Add token/org/project IDs to GitHub `staging` and `production` environments.

Vercel project environment variables:

| Variable | Preview/Staging | Production | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `/api` or staging API `/api` URL | `/api` or production API `/api` URL | If `/api`, set `KRESCO_BACKEND_ORIGIN`. |
| `KRESCO_BACKEND_ORIGIN` | staging backend HTTPS origin | production backend HTTPS origin | No path, just origin. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | staging Google client ID | production Google client ID | Public browser config, not secret. |
| `NEXT_PUBLIC_ABLY_ENABLED` | `true` | `true` | Realtime enabled. |
| `NEXT_PUBLIC_SITE_URL` | staging frontend URL | `https://kresco.ma` | Useful but not required by validator. |
| `NEXT_PUBLIC_RELEASE_SHA` | workflow-provided | workflow-provided | `deploy-frontend.yml` injects this from `${{ github.sha }}`. |

Remove from Vercel Preview for production-like staging:

```text
JWT_SECRET_KEY
NEXT_PUBLIC_ENABLE_LOCAL_DEMO_VIDEO
KRESCO_ENABLE_LOCAL_REWRITES
KRESCO_ENABLE_LOCAL_IMAGE_HOSTS
```

Backend secrets such as Stripe secret keys, Ably API keys, VdoCipher secrets, database URLs, and JWT secrets must not be placed in Vercel frontend env vars.

### 7.2 Google OAuth

Create two Google OAuth web clients:

```text
Kresco staging web client
Kresco production web client
```

For production:

```text
Authorized JavaScript origins:
https://kresco.ma
https://www.kresco.ma
```

Store the client ID in:

```text
AWS Secrets Manager: GOOGLE_CLIENT_ID
Vercel: NEXT_PUBLIC_GOOGLE_CLIENT_ID
```

The current repo uses the client ID only. Do not invent a Google client secret unless code is added for it.

### 7.3 Stripe

Stripe billing is intentionally deferred for the current non-Stripe launch gate. Keep Stripe secrets redacted and stage-specific, and keep diagnostics reporting enabled, but do not count Stripe configuration or provider reachability in the non-Stripe launch score until billing is explicitly pulled back into scope.

Create separate Stripe setup:

```text
staging: Stripe sandbox/test mode
production: Stripe live mode
```

For each environment:

1. Create the Pro product.
2. Save the product ID as `STRIPE_PRODUCT_ID`.
3. Create or choose the secret API key as `STRIPE_SK`.
4. Create a webhook endpoint:
   - staging endpoint: `https://<staging-backend-origin>/api/payments/webhook`
   - production endpoint: `https://<production-backend-origin>/api/payments/webhook`
5. Copy the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`.

Current billing model is one-time hosted Checkout. `STRIPE_PK` / publishable key is accepted by backend config but not required for the current server-created Checkout flow.

When Stripe is brought back into scope, run staging runtime verification with:

```powershell
python scripts/check_staging_runtime.py <staging-ready-url> --include-provider-reachability --require-payment-provider-reachability
```

### 7.4 Resend

Create separate API keys:

```text
RESEND_API_KEY for staging
RESEND_API_KEY for production
```

Recommended:

1. Verify sending domain in Resend.
2. Use a staging sender or subdomain for staging.
3. Use sending-only access if available.
4. Store only in AWS Secrets Manager runtime secret.

### 7.5 Ably

Create separate Ably apps:

```text
Kresco staging
Kresco production
```

Create an API key per app and store as:

```text
ABLY_API_KEY
```

Security rule:

1. The Ably API key is backend-only.
2. Never expose it to the browser.
3. Browser clients should use backend-issued short-lived Ably auth tokens.

### 7.6 VdoCipher

Create or obtain environment-specific VdoCipher API credentials.

Store:

```text
VDOCIPHER_API_SECRET
VDOCIPHER_API_BASE_URL
VDOCIPHER_LIVE_CREATE_URL
```

Expected API base for video OTP:

```text
https://dev.vdocipher.com/api
```

The API secret must stay backend-only. Do not put it in Vercel or `NEXT_PUBLIC_*`.

## 8. Exact Setup Sequence

Follow this order.

### Step 1: Freeze Production Deploys

Do not run production deploys yet.

Confirm the gate fails closed:

```powershell
python scripts/check_production_launch_gate.py --json
```

Expected today: fail until all traceability rows are verified and readiness score reaches target.

### Step 2: Create GitHub Environments

In GitHub:

```text
Settings -> Environments
```

Create or normalize:

```text
staging
production
```

For `production`, add required reviewers before adding secrets.

### Step 3: Add GitHub Environment Vars

Use the GitHub UI or safe CLI commands for non-secret vars.

Production examples:

```powershell
gh variable set FRONTEND_URL --env production --body "https://kresco.ma"
gh variable set CORS_ALLOWED_ORIGINS --env production --body "https://kresco.ma,https://www.kresco.ma"
gh variable set CORS_ALLOW_ORIGIN_REGEX --env production --body "^$"
```

Set `BACKEND_READY_URL` only after the production backend URL exists.

### Step 4: Provision AWS Staging

Create:

1. Staging RDS PostgreSQL.
2. Staging RDS Proxy.
3. Staging S3 media bucket or prefix.
4. Staging Secrets Manager secret `kresco/staging/runtime`.
5. CloudWatch logs/metrics visibility.
6. IAM deploy principal permissions.

Then populate:

```text
GitHub staging secrets
GitHub staging vars
AWS kresco/staging/runtime JSON
Vercel Preview env vars
```

### Step 5: Provision Provider Staging Credentials

Create staging/test credentials:

```text
Google OAuth staging web client
Stripe sandbox key, product, webhook
Resend staging API key
Ably staging app/key
VdoCipher staging/dev API key and live create URL
```

Install them only into:

```text
AWS Secrets Manager kresco/staging/runtime
Vercel Preview for public frontend values
GitHub staging environment secrets/vars where workflows require them
```

### Step 6: Run Staging Backend Deploy

Run manually:

```text
GitHub Actions -> Deploy FastAPI to AWS Lambda
stage: staging
confirm_database_migration: false
```

The workflow must pass:

1. repo hygiene
2. secret hygiene
3. disposable Postgres Alembic upgrade
4. data integrity audit
5. query plan audit
6. backend startup check
7. backend tests
8. real target DB migration
9. VPC config resolution
10. Zappa render
11. Lambda deploy/update
12. Zappa schedule
13. `scripts/check_staging_runtime.py`

The workflow asks diagnostics to include provider reachability so the JSON evidence can report deferred Stripe payment status. For the current non-Stripe launch scope, a payment-only diagnostics error does not fail staging verification. Database, migrations, storage, realtime, video, email, readiness, and outbox checks remain blocking.

If runtime verification fails on a non-deferred check, staging is not ready.

### Step 7: Run Staging Frontend Deploy

Run manually:

```text
GitHub Actions -> Deploy Frontend to Vercel
environment: staging
```

The workflow must pass:

1. repo hygiene
2. secret hygiene
3. `npm ci`
4. lint
5. typecheck
6. unit coverage
7. browser smoke E2E
8. backend-backed integration E2E
9. Vercel preview env pull
10. Vercel build
11. prebuilt Vercel deploy

### Step 8: Verify Staging Manually

Record evidence for:

1. `/ready` returns ready.
2. `/api/internal/diagnostics` returns ready with no secret values.
3. Student login works.
4. Professor login works.
5. Course/topic/watch journey works.
6. Media upload writes to S3 and direct anonymous object read fails.
7. VdoCipher OTP/embed works for real content.
8. Resend email path works.
9. Stripe sandbox Checkout and webhook entitlement work if Stripe has been pulled back into the launch scope; otherwise record payment diagnostics as deferred.
10. Ably realtime event and outbox drain work.
11. Scheduled realtime outbox worker fires.
12. 50-student or agreed load test is run against staging.
13. Rollback drill succeeds on staging.
14. RDS snapshot/restore drill succeeds on staging.

Attach evidence to the launch gate docs. Do not include secret values.

### Step 9: Provision Production Services

Repeat AWS/provider setup for production:

```text
Production RDS PostgreSQL
Production RDS Proxy
Production S3 bucket/prefix
Production Secrets Manager secret kresco/production/runtime
Production CloudWatch alarms
Production Google OAuth client
Production Stripe live product/key/webhook
Production Resend key/domain
Production Ably app/key
Production VdoCipher key/live URL
```

Populate:

```text
GitHub production secrets
GitHub production vars
AWS kresco/production/runtime JSON
Vercel Production env vars
```

### Step 10: Pass The Production Launch Gate

Before any production deploy:

```powershell
python scripts/check_secret_hygiene.py --include-local-env
python scripts/check_secret_hygiene.py --include-local-env --require-rotation-checklist
python scripts/check_repo_hygiene.py
python scripts/check_production_launch_gate.py
```

The rotation-checklist variant must pass before production because it verifies that local ignored env files were scanned and that provider-side rotation evidence is complete without printing secret values. `check_production_launch_gate.py` must pass. If either check fails, production deploy is not approved.

### Step 11: Run Production Backend Deploy

Only after staging evidence and launch gate pass:

```text
GitHub Actions -> Deploy FastAPI to AWS Lambda
stage: production
confirm_database_migration: true
```

Production backend deploy additionally requires:

1. production environment approval
2. production launch gate pass
3. `CLOUDWATCH_ALARM_NAMES`
4. RDS snapshot before migration
5. either `RDS_DB_CLUSTER_IDENTIFIER` or `RDS_DB_INSTANCE_IDENTIFIER`

### Step 12: Run Production Frontend Deploy

Only after backend production is healthy:

```text
GitHub Actions -> Deploy Frontend to Vercel
environment: production
```

The workflow will:

1. require production environment approval
2. enforce production launch gate
3. pull Vercel production env
4. validate frontend production env
5. build with `NEXT_PUBLIC_RELEASE_SHA=${{ github.sha }}`
6. deploy prebuilt output to Vercel production

### Step 13: Post-Production Verification

Immediately verify:

```text
https://kresco.ma
https://www.kresco.ma
production BACKEND_READY_URL
production /api/internal/diagnostics
```

Smoke:

1. login
2. logout
3. student home
4. course/topic/watch
5. professor live/chat
6. media read/write
7. payment checkout and webhook
8. email send
9. client error reporting
10. backend request IDs and release SHA in responses

## 9. Rollback And Crash Handling

### Frontend Rollback

Use Vercel rollback or redeploy the last known-good commit.

Safe when:

1. backend API contract is still compatible
2. no frontend-only migration issue exists
3. production smoke passes after rollback

### Backend Rollback

Use the backend deploy workflow on the last known-good commit.

Safe when:

1. database schema remains compatible
2. no destructive migration has made old code unsafe
3. `/ready` and diagnostics pass after redeploy

### Database Migration Rollback

Do not blindly run Alembic downgrade in production.

Required process:

1. Identify current Alembic head from diagnostics.
2. Take a fresh RDS snapshot.
3. Restore snapshot into staging.
4. Test the downgrade or forward fix in staging.
5. Get rollback owner and database owner approval.
6. Execute only the tested command.
7. Re-run diagnostics and core user journeys.

### Crash And Incident Response

For crashes:

1. Check CloudWatch alarms listed in `CLOUDWATCH_ALARM_NAMES`.
2. Check backend logs around request ID and release SHA.
3. Check Vercel deployment logs and browser/client error metrics.
4. Check `/ready`.
5. Check `/api/internal/diagnostics`.
6. If recent deploy caused it and DB compatibility is safe, rollback app.
7. If data is damaged, restore into a new DB/proxy target first. Do not overwrite production in place.

## 10. User And Update Handling

Users live in production RDS. Deploys must not reset user data.

Rules for updates:

1. Migrations run before Lambda deployment in `deploy-backend.yml`.
2. Prefer backward-compatible migrations:
   - add nullable columns first
   - deploy code that writes both old/new if needed
   - backfill
   - enforce constraints later
   - remove old fields only after compatibility window
3. Take an RDS snapshot before production migrations.
4. Do not ship breaking API shape changes unless frontend and backend are deployed in a coordinated order.
5. Test the same commit in staging before production.

## 11. What To Clean Up Now

Do these before treating staging as production-like:

1. Create canonical lowercase `production` GitHub Environment.
2. Add required reviewers to `production`.
3. Add production environment secrets and vars.
4. Move away from repo-level deploy secrets once environment-level secrets are complete.
5. Remove `JWT_SECRET_KEY` from Vercel Preview.
6. Remove or force false in Vercel Preview:
   - `NEXT_PUBLIC_ENABLE_LOCAL_DEMO_VIDEO`
   - `KRESCO_ENABLE_LOCAL_REWRITES`
   - `KRESCO_ENABLE_LOCAL_IMAGE_HOSTS`
7. Configure AWS CLI locally or use AWS Console to verify:
   - Secrets Manager secret contents by key name
   - RDS Proxy endpoint
   - S3 Block Public Access
   - CloudWatch alarms
8. Fill `docs/secrets-rotation-checklist.md` with provider evidence links.
9. Add provider evidence coverage for `KRESCO_RATE_LIMIT_STORAGE_URI` if the shared rate-limit store URI contains credentials or deployment-specific access material.

## 12. Validation Commands

Run locally:

```powershell
python scripts/check_repo_hygiene.py
python scripts/check_secret_hygiene.py --include-local-env
python scripts/check_secret_hygiene.py --include-local-env --require-rotation-checklist
python scripts/check_production_launch_gate.py --json
```

Inspect GitHub names without printing values:

```powershell
gh secret list --env staging
gh variable list --env staging
gh secret list --env production
gh variable list --env production
```

Inspect Vercel env names without printing values:

```powershell
cd frontend
vercel env list preview --no-color
vercel env list production --no-color
```

Check AWS identity once configured:

```powershell
aws sts get-caller-identity
```

## 13. Official References

- GitHub Environments and protection rules: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- GitHub Actions variables: https://docs.github.com/actions/reference/environment-variables
- Vercel environment CLI: https://vercel.com/docs/cli/env
- Vercel CLI global `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and token options: https://vercel.com/docs/cli/global-options
- AWS Secrets Manager create secret: https://docs.aws.amazon.com/secretsmanager/latest/userguide/create_secret.html
- AWS IAM access keys: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html
- Stripe API keys and webhook secrets: https://docs.stripe.com/keys
- Stripe webhooks: https://docs.stripe.com/webhooks
- Google OAuth clients: https://support.google.com/cloud/answer/15549257
- Resend API keys: https://resend.com/docs/dashboard/api-keys/introduction
- Ably authentication and API keys: https://ably.com/docs/auth
- VdoCipher server API: https://www.vdocipher.com/docs/server
- VdoCipher API key guide: https://www.vdocipher.com/blog/client-secret-key/

## 14. Final Production Readiness Rule

Production is ready only when all of these are true:

1. `staging` deploy works end to end.
2. `production` GitHub Environment is protected and fully populated.
3. AWS Secrets Manager has separate verified staging and production runtime secrets.
4. Vercel Preview and Production envs are clean and stage-specific.
5. Provider credentials are separate by environment.
6. CloudWatch alarms exist and are referenced by `CLOUDWATCH_ALARM_NAMES`.
7. RDS snapshot/restore and rollback drills have staging evidence.
8. `python scripts/check_production_launch_gate.py` passes.
9. A production owner approves the deploy.

Until then, the correct production decision is: do not deploy production.
