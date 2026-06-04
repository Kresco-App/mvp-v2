# Manual Operations

This file lists current operations that require credentials, provider dashboards, or content ownership.

## Local Runtime

Start backend:

```bash
cd backend
python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
```

Start frontend:

```bash
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

## Required Secrets

Set secrets in local environment files or deployment provider dashboards. Do not commit real values.

Run the tracked-file scanner in CI and before hand-off:

```bash
python scripts/check_secret_hygiene.py
```

Before release, also run the local ignored-env scan on any workstation used for deploy or debugging:

```bash
python scripts/check_secret_hygiene.py --include-local-env
```

If the local scan reports any finding, rotate the affected provider credential and record the rotation in `docs/secrets-rotation-checklist.md`. The scanner redacts values by design; do not paste secrets into issue comments, docs, or chat.

Backend:

```text
DATABASE_URL=
DATABASE_CONNECTION_STRATEGY=rds_proxy
PGSSLROOTCERT=certifi
JWT_SECRET_KEY=
STRIPE_SK=
STRIPE_PRODUCT_ID=
STRIPE_WEBHOOK_SECRET=
VDOCIPHER_API_SECRET=
VDOCIPHER_API_BASE_URL=
VDOCIPHER_LIVE_CREATE_URL=
ABLY_API_KEY=
ABLY_TOKEN_TTL_SECONDS=3600
REALTIME_OUTBOX_SECRET=
FRONTEND_URL=
MEDIA_STORAGE_BACKEND=s3
MEDIA_S3_BUCKET=
MEDIA_S3_REGION=
MEDIA_S3_PREFIX=
MEDIA_S3_PRESIGN_TTL_SECONDS=3600
MEDIA_PROFILE_QUOTA_BYTES=10485760
MEDIA_CHAT_CONVERSATION_QUOTA_BYTES=52428800
MEDIA_S3_LIFECYCLE_EXPIRATION_DAYS=365
```

Frontend:

```text
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
NEXT_PUBLIC_ABLY_ENABLED=
```

## Current Admin Surface

Use SQLAdmin at:

```text
http://127.0.0.1:8000/admin
```

SQLAdmin uses database-backed staff accounts. The signing key is `JWT_SECRET_KEY`; there is no shared admin password.

To grant access, set `users.is_staff=true` only for an already verified, active staff member with a real password hash. To revoke access immediately, set `users.is_staff=false` or increment `users.auth_token_version`; existing SQLAdmin sessions are rechecked against the database on every request.

## Media Storage

Development and tests may use local `/media` paths. Production-like environments must use `MEDIA_STORAGE_BACKEND=s3`; uploaded profile and professor-chat media is stored as `s3://bucket/key` in the database and returned to clients as short-lived presigned GET URLs.

Production/staging upload quotas are enforced by the API before storage writes:

- `MEDIA_PROFILE_QUOTA_BYTES` caps the combined current avatar and banner bytes per user. Replacing an avatar or banner replaces that slot's byte count.
- `MEDIA_CHAT_CONVERSATION_QUOTA_BYTES` caps total attached image bytes per professor-chat conversation.

Configure the S3 bucket with Block Public Access enabled, no public read bucket policy, and a lifecycle rule at least as strict as the runtime `MEDIA_S3_LIFECYCLE_EXPIRATION_DAYS` value. A minimal lifecycle configuration for the checked-in stage prefixes is:

```json
{
  "Rules": [
    {
      "ID": "kresco-staging-media-retention",
      "Status": "Enabled",
      "Filter": { "Prefix": "staging/" },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 },
      "Expiration": { "Days": 30 }
    },
    {
      "ID": "kresco-production-media-retention",
      "Status": "Enabled",
      "Filter": { "Prefix": "production/" },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 },
      "Expiration": { "Days": 365 }
    }
  ]
}
```

Before launch, verify anonymous `GET` to an uploaded object key fails through S3/API Gateway while an authenticated app request receives a short-lived presigned URL. Local `s3-mock` tests prove URL/reference shape; they do not prove the real bucket policy.

## Backend Staging And Production Deploys

Backend deploys are stage-aware. The checked-in Zappa template must keep runtime-specific values as placeholders; set `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `DATABASE_URL`, `MEDIA_S3_BUCKET`, `REALTIME_OUTBOX_SECRET`, and provider credentials as environment-scoped GitHub secrets or variables for each GitHub Environment.

Use the backend deploy workflow manually for staging first. Select the `staging` stage and confirm it renders `KRESCO_ENV=staging` and `MEDIA_S3_PREFIX=staging`. The workflow runs `scripts/check_staging_runtime.py` after Lambda deploy and `zappa schedule`; it must pass `/ready`, `/api/internal/diagnostics`, and a bounded protected outbox-drain call before the deploy is considered usable evidence.

There is no push-to-`master` production deploy path during the freeze. Backend and frontend production deploy workflows run `scripts/check_production_launch_gate.py` before any provider deployment step. That gate fails closed until every traceability row is `verified` and `PRODUCTION-SWITCH.md` records a score at or above the target.

Use `docs/production-runbook.md` for deploy, rollback, migration rollback, backup/restore, and incident response steps. The runbook must be drilled on staging before production promotion.

Minimum stage separation before launch:

- Separate staging and production database URLs.
- Separate staging and production S3 media buckets or prefixes.
- Separate frontend URLs and CORS origin lists.
- Separate `REALTIME_OUTBOX_SECRET`, JWT secret, Stripe webhook secret, and provider credentials.

## Realtime Outbox

Professor live and chat events are written to `realtime_outbox` inside the same database transaction as the product change. Live-session broadcasts use offering notification channels (`kresco:offering:{id}:notifications`) plus session channels (`kresco:live:{id}`); private chat still uses per-user/professor channels. A trusted worker must call:

```text
POST /api/internal/realtime/process-outbox
x-kresco-internal-secret: <REALTIME_OUTBOX_SECRET>
```

The checked-in Zappa stages include a scheduled worker entrypoint, `app.scheduled.process_realtime_outbox_event`, with `rate(1 minute)`. The backend deploy workflow runs `zappa schedule "$ZAPPA_STAGE"` after deploy/update so EventBridge rules are created from `zappa_settings.json`.

Launch sign-off still requires proof from staging that the schedule is actually firing and draining rows. Use the protected HTTP endpoint for manual recovery or diagnostics. The worker retries failed Ably publishes with backoff and moves exhausted rows to `dead`; dead rows require operator review before launch sign-off.

## Internal Production Diagnostics

Use `/health` only for cheap liveness and `/ready` for deployment readiness. For launch-gate diagnostics, call:

```text
GET /api/internal/diagnostics
x-kresco-internal-secret: <REALTIME_OUTBOX_SECRET>
```

The response reports database reachability, Alembic head state, S3 media configuration, Ably/outbox state, VdoCipher configuration, and Resend configuration without returning secret values. Treat `status="not_ready"` or any check with `status="error"` as a failed release gate.

## RDS TLS

Production database URLs must include `sslmode=verify-full`. For RDS Proxy endpoints, set `PGSSLROOTCERT=certifi` so Python uses the certifi CA store, which includes the Amazon Trust Services roots used by AWS Certificate Manager certificates on RDS Proxy. Direct RDS instance connections may still use the bundled AWS RDS CA file at `certs/rds-global-bundle.pem`.

Production-like deployments must also declare `DATABASE_CONNECTION_STRATEGY=rds_proxy`. The Lambda SQLAlchemy engine uses short-lived connections in Lambda, and the database URL must point at the RDS Proxy endpoint so concurrency spikes do not connect directly to the database writer.

Current content work should target:

- Subjects.
- Topics.
- TopicSections.
- TopicItems.
- Resources.
- TabContent.
- QuestionSets.
- Questions.
- Exams and ExamProblems.
- Access gates and publish state.

## Current Content Rule

Add a final `TopicSection`, for example `Synthese et Revision`, and place summary, animated courses, labs, quiz collections, notes, and resource collections there as normal path items.

## Verification Before Hand-off

```bash
cd backend
python -m pytest tests_fastapi
python scripts/audit_query_plans.py

cd ../frontend
npm run lint
npm test
npm run build
```
