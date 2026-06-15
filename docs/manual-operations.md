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
CMI_CLIENT_ID=
CMI_STORE_KEY=
CMI_PAYMENT_URL=
CMI_OK_URL=
CMI_FAIL_URL=
CMI_CALLBACK_URL=
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

Collect redacted local posture evidence before attaching S3 proof to the launch gate:

```bash
python scripts/check_s3_media_posture.py "<bucket>" \
  --prefix "staging" \
  --expected-retention-days 365 \
  --anonymous-read-key "staging/profile/<known-uploaded-object>" \
  --json
```

The verifier uses `boto3` or the AWS CLI, checks bucket-level Block Public Access, default bucket encryption, an enabled lifecycle expiration rule covering the prefix, and an unauthenticated ranged GET against an existing object. If `--anonymous-read-key` is omitted, it samples one object under the prefix; if no object or policy evidence is available, it fails closed. The output redacts bucket, prefix, and object-key identifiers.

The backend deploy workflow runs the same S3 posture verifier after staging runtime verification. The manual `Staging Launch Evidence` workflow also collects this output and uploads it as `s3-media-posture.json`.

Before launch, verify anonymous `GET` to an uploaded object key fails through S3/API Gateway while an authenticated app request receives a short-lived presigned URL. Local `s3-mock` tests prove URL/reference shape; they do not prove the real bucket policy.

## Backend Staging And Production Deploys

Backend deploys are stage-aware. The checked-in Zappa template must keep runtime-specific values as placeholders; set `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `DATABASE_URL`, `MEDIA_S3_BUCKET`, `KRESCO_RATE_LIMIT_STORAGE_URI`, `REALTIME_OUTBOX_SECRET`, and provider credentials as environment-scoped GitHub secrets or variables for each GitHub Environment.

Use the backend deploy workflow manually for staging first. Select the `staging` stage and confirm it renders `KRESCO_ENV=staging` and `MEDIA_S3_PREFIX=staging`. The workflow runs `scripts/check_staging_runtime.py --include-provider-reachability` after Lambda deploy and `zappa schedule`; it must pass `/ready`, `/api/internal/diagnostics`, and a bounded protected outbox-drain call before the deploy is considered usable non-Stripe evidence.

Stripe billing is deferred for the current launch gate. The staging verifier still reports the payment diagnostics object and Stripe reachability result when provider reachability is included, but payment status does not fail the non-Stripe launch verifier. Use `--require-payment-provider-reachability` only when Stripe billing is pulled back into the launch scope.

## Frontend Production Deploys

Production frontend deploys must scan both the fresh Vercel deployment URL and every public production alias users can hit. Set GitHub Environment var `FRONTEND_PRODUCTION_BASE_URLS` on `production` to a comma- or whitespace-separated list such as `https://kresco.ma,https://www.kresco.ma,https://mvp-v2-theta.vercel.app`. If an alias returns `404` for a required route like `/onboarding`, keep `FE-DEMO-001` in progress and redeploy or fix the Vercel project/root/alias configuration before launch sign-off.

## Staging Ops And Performance Evidence

The staging ops/performance collectors below are executable evidence collectors only. They do not mark traceability rows verified by themselves; attach their real staging JSON output and the referenced drill artifacts before moving `OPS-RDS-001`, `OPS-LAMBDA-001`, `OPS-RUNBOOK-001`, or `PERF-TOPIC-001` out of `in_progress`.

To collect the whole launch-evidence bundle from GitHub, run the manual `Staging Launch Evidence` workflow in the `staging` Environment. It configures AWS credentials, runs the secret rotation checklist gate, collects runtime diagnostics, S3 media posture, ops posture, realtime outbox, realtime fanout-50 provider delivery, and topic latency, then uploads redacted JSON artifacts. JSON collectors run through `scripts/run_evidence_command.py` with JSON validation, and the workflow validates that every expected artifact exists and is parseable before upload. The workflow is expected to fail closed until every required staging variable, secret, AWS permission, auth token, and drill artifact is present.

Collect RDS Proxy, Lambda, EventBridge, and runbook-drill posture:

```bash
python scripts/check_staging_ops_posture.py \
  --region eu-west-3 \
  --rds-proxy-name "$STAGING_RDS_PROXY_NAME" \
  --lambda-function-name "$STAGING_LAMBDA_FUNCTION_NAME" \
  --keep-warm-rule-name "$STAGING_KEEP_WARM_RULE_NAME" \
  --worker-schedule-rule-name "$STAGING_WORKER_SCHEDULE_RULE_NAME" \
  --drill-evidence-file artifacts/staging-ops-drills.json \
  --json
```

The script uses `boto3` when available and falls back to the AWS CLI when possible. It fails closed when RDS Proxy target health is missing or not `AVAILABLE`, RDS Proxy `RequireTLS` is not true, Lambda memory/timeout are below the production-like thresholds, keep-warm or worker EventBridge schedules are missing/disabled/not targeting the Lambda, or the drill evidence file is absent/incomplete. JSON output redacts sensitive keys, URL query strings, AWS account IDs, and access-key-shaped values.

The drill evidence file must be operator-created JSON from staging. Minimum shape:

```json
{
  "environment": "staging",
  "executed_at": "2026-06-05T12:00:00Z",
  "rollback_drill": { "status": "passed", "artifact": "artifacts/staging-rollback.md" },
  "migration_rollback_drill": { "status": "passed", "artifact": "artifacts/staging-migration-rollback.md" },
  "backup_restore_drill": { "status": "passed", "artifact": "artifacts/staging-backup-restore.md" },
  "incident_response_drill": { "status": "passed", "artifact": "artifacts/staging-incident-response.md" }
}
```

Collect topic workspace/search latency against staging:

```bash
python scripts/check_staging_topic_latency.py \
  --backend-url "$STAGING_BACKEND_URL" \
  --topic-id "$STAGING_TOPIC_ID" \
  --auth-token "$STAGING_AUTH_TOKEN" \
  --search-query "$STAGING_TOPIC_SEARCH_QUERY" \
  --workspace-threshold-ms 1000 \
  --search-threshold-ms 1500 \
  --samples 5 \
  --warmups 1 \
  --json
```

The topic latency collector sends the auth token in the configured header, redacts the header value in output, and measures `/api/courses/topics/{topic_id}/workspace` plus the same endpoint with `q=<search>`. The backend URL must be an HTTPS non-local staging URL; localhost, loopback, and local tunnel origins fail preflight and perform no HTTP request. If staging URL, topic id, auth token, or search query is missing, it emits fail-closed contract-mode JSON and performs no HTTP request.

There is no push-to-`master` production deploy path during the freeze. Backend and frontend production deploy workflows run `scripts/check_production_launch_gate.py` before any provider deployment step. That gate fails closed until every traceability row is `verified` and `PRODUCTION-SWITCH.md` records a score at or above the target.

Use `docs/production-runbook.md` for deploy, rollback, migration rollback, backup/restore, and incident response steps. The runbook must be drilled on staging before production promotion.

Minimum stage separation before launch:

- Separate staging and production database URLs.
- Separate staging and production S3 media buckets or prefixes.
- Separate frontend URLs and CORS origin lists.
- Separate `KRESCO_RATE_LIMIT_STORAGE_URI`, `REALTIME_OUTBOX_SECRET`, JWT secret, Stripe webhook secret, and provider credentials.

## Realtime Outbox

Professor live and chat events are written to `realtime_outbox` inside the same database transaction as the product change. Live-session broadcasts use offering notification channels (`kresco:offering:{id}:notifications`) plus session channels (`kresco:live:{id}`); private chat still uses per-user/professor channels. A trusted worker must call:

```text
POST /api/internal/realtime/process-outbox
x-kresco-internal-secret: <REALTIME_OUTBOX_SECRET>
```

The checked-in Zappa stages include a scheduled worker entrypoint, `app.scheduled.process_realtime_outbox_event`, with `rate(1 minute)`. The backend deploy workflow runs `zappa schedule "$ZAPPA_STAGE"` after deploy/update so EventBridge rules are created from `zappa_settings.json`.

Launch sign-off still requires proof from staging that the schedule is actually firing and draining rows. Use the protected HTTP endpoint for manual recovery or diagnostics. The worker retries failed Ably publishes with backoff and moves exhausted rows to `dead`; dead rows require operator review before launch sign-off.

### Staging realtime fanout/outbox probe

Use the executable probe as an evidence collector, not as proof by itself:

```bash
python scripts/check_staging_realtime_fanout.py --mode outbox --json
```

Inputs:

- `STAGING_BACKEND_URL` or `BACKEND_READY_URL` points at the staging backend origin/stage URL or `/ready` URL.
- `KRESCO_INTERNAL_SECRET` or `REALTIME_OUTBOX_SECRET` supplies the protected worker secret.

The probe sends the internal secret only as `x-kresco-internal-secret` and does not print it. `--mode outbox` checks `/ready`, protected diagnostics, and a bounded `POST /api/internal/realtime/process-outbox`.

For the 50-student live fanout collection, choose an existing staging live session and provide a professor bearer token plus 50 student bearer tokens from staging accounts that should be eligible for the session. The probe rejects `fanout-50` evidence when `expected_students` is below 50. Put the student tokens in a JSON array or newline-separated file instead of pasting them into docs:

```bash
python scripts/check_staging_realtime_fanout.py \
  --mode fanout-50 \
  --live-session-id "$STAGING_LIVE_SESSION_ID" \
  --student-token-file "$STAGING_STUDENT_TOKENS_FILE" \
  --require-provider-delivery \
  --json
```

Additional inputs for full collection:

- `STAGING_PROFESSOR_TOKEN` or `--professor-token` authorizes the professor live-session action.
- `STAGING_STUDENT_TOKENS_FILE` or `STAGING_STUDENT_TOKENS` supplies the student tokens.
- `ABLY_API_KEY` or `--ably-api-key` is required when `--require-provider-delivery` is used so the probe can verify Ably history for the expected offering-channel event. The probe rejects matching Ably history entries older than the professor action it just triggered.

If the operator cannot supply the required staging auth tokens or provider key, run `--mode contract` to validate URL/secret wiring only. Contract mode intentionally exits non-zero because it has not collected runtime fanout evidence. Even a successful HTTP probe does not prove the EventBridge schedule is firing; attach CloudWatch/EventBridge evidence for the scheduled worker before launch sign-off.

## Internal Production Diagnostics

Use `/health` only for cheap liveness and `/ready` for deployment readiness. For launch-gate diagnostics, call:

```text
GET /api/internal/diagnostics
x-kresco-internal-secret: <REALTIME_OUTBOX_SECRET>
```

The response reports database reachability, Alembic head state, S3 media configuration, Ably/outbox state, VdoCipher configuration, and Resend configuration without returning secret values. Treat `status="not_ready"` or any check with `status="error"` as a failed release gate.

Exception for the current non-Stripe launch gate: a diagnostics payload whose only error is `payment` is deferred and must be recorded, not counted as a launch-blocking runtime failure. Non-deferred checks such as database, migrations, storage, realtime, video, and email remain blocking.

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
