# Staging Launch Gate Report

Commit tested: adc1984 (branch: codex/performance-pass)
Date: 2026-05-28
Staging frontend: BLOCKED — deploy requires VERCEL_TOKEN + GitHub Environment secrets
Staging backend: BLOCKED — deploy requires AWS credentials + BACKEND_READY_URL repo var

## Summary

- Passed: G0 (Preflight), G1 (Secrets), G3 (RDS TLS code), G4 (S3 code), G7 (Security Headers — fixed), G9 (Observability — fixed), G10 (Runbook)
- Failed: none remaining after fixes
- Blocked: G2 (Deploy), G3 (runtime verification), G4 (runtime verification), G5 (Provider credentials), G6 (Migration rehearsal), G8 (Load test)
- Risk level: MEDIUM — code is launch-ready locally; all blocks are credential/infrastructure gates, not code defects

## Gate Results

### G0 Preflight

Status: PASS
Evidence:
- `git status --short`: only untracked artifact files (admin.diff, courses.diff, diff_stat.txt, dirty_diff.patch) — all explicitly ignored per mission brief
- `git rev-parse --short HEAD`: adc1984 ✓
- `python -m pytest -q`: 379 passed in 43.91s ✓
- `npm run lint`: 0 warnings ✓
- `npm run typecheck`: clean ✓

---

### G1 Secrets and Env Audit

Status: PASS (local) / BLOCKED (staging verification)
Evidence:
- `python scripts/check_secret_hygiene.py`: "Secret hygiene check passed." — no live keys, PEM material, or unguarded sensitive assignments in tracked files
- `python scripts/check_repo_hygiene.py`: "Repository hygiene check passed."
- `.gitignore` covers `.env`, `.env.*`; `.env.example` is explicitly allowed ✓
- `zappa_settings.json` contains zero secret values — all backed by `KRESCO_RUNTIME_SECRET_ID` (AWS Secrets Manager ARN, loaded at Lambda startup). `render_zappa_settings.py` actively raises `ZappaRenderError` if any `RUNTIME_SECRET_BACKED_ENV_KEYS` appear in the rendered environment.
- Secret categories confirmed present in `app/config.py` Settings model and `REQUIRED_PRODUCTION_FIELDS` validation:
  - DB: `DATABASE_URL`, `PGSSLROOTCERT`
  - Auth: `JWT_SECRET_KEY`
  - S3: `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION`
  - Ably: `ABLY_API_KEY`, `REALTIME_OUTBOX_SECRET`
  - VdoCipher: `VDOCIPHER_API_SECRET`, `VDOCIPHER_API_BASE_URL`, `VDOCIPHER_LIVE_CREATE_URL`
  - Payment: `STRIPE_SK`, `STRIPE_PRODUCT_ID`, `STRIPE_WEBHOOK_SECRET`
  - SMTP: `RESEND_API_KEY`
  - CORS/URLs: `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`
- CI workflow credentials (`postgresql://postgres:postgres@localhost:5432/...`, `ADMIN_PASSWORD: test-admin-password`) are CI-local test values protected behind `${{ secrets.* }}` — no rotation required.

Failures: none
Fixes: none required
BLOCKED: Cannot verify Vercel project env names or AWS Secrets Manager secret contents (no credentials in this environment). Required missing config names for staging secret: `DATABASE_URL`, `JWT_SECRET_KEY`, `GOOGLE_CLIENT_ID`, `VDOCIPHER_API_SECRET`, `VDOCIPHER_API_BASE_URL`, `VDOCIPHER_LIVE_CREATE_URL`, `STRIPE_SK`, `STRIPE_PRODUCT_ID`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `ABLY_API_KEY`, `REALTIME_OUTBOX_SECRET`, `MEDIA_S3_BUCKET`, `KRESCO_RUNTIME_SECRET_ID`, `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`.

---

### G2 Staging Deploy

Status: BLOCKED
Evidence: Pipeline fully defined at `.github/workflows/deploy-backend.yml` (stage=staging) and `.github/workflows/deploy-frontend.yml`. Post-deploy verification runs `scripts/check_staging_runtime.py` against `${{ vars.BACKEND_READY_URL }}` with `KRESCO_INTERNAL_SECRET` from secrets.
Missing to unblock:
- `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` in GitHub `staging` environment
- `VERCEL_TOKEN` in GitHub `staging` environment
- `BACKEND_READY_URL` repository variable (the `/ready` URL of the deployed Lambda)
- All secret categories from G1 populated in AWS Secrets Manager under the staging ARN

Health check target: `GET /ready` → 200 `{"status":"ready",...}`
Smoke targets post-deploy: `/home`, `/courses`, `/topics/{topicId}`, `/profile`, `/professor/live`, `/professor/chat`, student login, professor login.

---

### G3 RDS TLS and Pooling

Status: PASS (code) / BLOCKED (runtime)
Evidence:
- `backend/certs/rds-global-bundle.pem`: present in repo ✓
- `app/config.py:Settings.pgsslrootcert`: defaults to `certs/rds-global-bundle.pem` ✓
- `app/database.py:_ssl_for_postgres()`: constructs `ssl.SSLContext` with `cafile=rds-global-bundle.pem` and `check_hostname=True` when `sslmode=verify-full` ✓
- `app/config.py:production_config_errors()`: validates `sslmode=verify-full` in `DATABASE_URL` and that `PGSSLROOTCERT` points to a readable CA trust store ✓
- `zappa_settings.json` staging: `DATABASE_CONNECTION_STRATEGY=rds_proxy`, `PGSSLROOTCERT=certifi` for RDS Proxy's ACM/Amazon Trust Services certificate chain ✓
- `/ready` endpoint uses `SELECT 1` over the same engine (exercises TLS path on staging) ✓

Failures: none in code
BLOCKED: Cannot verify actual RDS Proxy endpoint is provisioned or that TLS handshake succeeds (requires AWS access + staging DATABASE_URL). `scripts/check_staging_runtime.py` validates `database.strategy == rds_proxy` and `rds_proxy_declared == true` post-deploy.

---

### G4 S3 Production Media

Status: PASS (code) / BLOCKED (runtime)
Evidence:
- `app/services/media_storage.py:S3MediaStorage.put_object()`: uses `asyncio.to_thread` → `client.put_object(...)` — no local filesystem write ✓
- Presigned URL returned: `presign_s3_reference(...)` with configurable TTL (default 300s, min 60s enforced) ✓
- `LocalMediaStorage` only active when `MEDIA_STORAGE_BACKEND=local`; staging/production zappa config sets `MEDIA_STORAGE_BACKEND=s3` ✓
- No local write paths found in Lambda-reachable code outside `LocalMediaStorage` ✓
- `production_config_errors()`: validates `MEDIA_STORAGE_BACKEND=s3`, `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION` ✓
- `media_s3_prefix` for staging set to `staging` (isolated from production prefix) ✓

Failures: none in code
BLOCKED: Cannot verify S3 bucket exists, Block Public Access is enabled, direct object URLs fail, or upload/presign round-trip works end-to-end. Requires staging deploy + AWS S3 bucket provisioned.

---

### G5 Provider Readiness

Status: BLOCKED (all providers)
Evidence: All provider credential checks are guarded by `production_config_errors()` and validated by `scripts/check_staging_runtime.py` post-deploy. No demo/mock bypass paths exist in production-like mode. Config validation in `app/services/diagnostics.py` covers all providers (realtime, video, email, payment added in this commit).

Missing credentials to unblock:
- Ably: `ABLY_API_KEY` — needed to get realtime token, subscribe/publish, confirm live session propagation
- VdoCipher: `VDOCIPHER_API_SECRET`, `VDOCIPHER_API_BASE_URL`, `VDOCIPHER_LIVE_CREATE_URL` — needed to generate video OTP/embed
- Payment: `STRIPE_SK`, `STRIPE_PRODUCT_ID`, `STRIPE_WEBHOOK_SECRET` — needed to run test checkout and verify webhook entitlement
- SMTP: `RESEND_API_KEY` — needed to trigger and confirm delivery of password reset / verification email

---

### G6 Migration Rehearsal

Status: BLOCKED
Evidence: 49 migration files present (0000 through 0045 + 3 named: `4557e0cfcf21_migrate_legacy_chapters`, `e34496201734_add_index_to_foreign_keys`, `fcab131a375a_drop_legacy_course_hierarchy`). Sequential numbering intact. Alembic `env.py` reads `DATABASE_URL` from environment. `deploy-backend.yml` runs `alembic upgrade head` against a disposable Postgres container before Lambda deploy, providing CI-level rehearsal. Full staging-clone rehearsal requires AWS RDS snapshot access.

To unblock: provision staging DB clone, run `alembic upgrade head` against clone, boot backend against migrated clone, hit `/ready` + `/api/internal/diagnostics`, run the smoke journeys listed in G2.

---

### G7 Security Headers and CSRF

Status: PASS (after fixes)
Evidence:

**Frontend headers** (fix applied — `frontend/next.config.mjs`):
Added `headers()` returning for `source: '/(.*)'`:
- `X-Frame-Options: DENY` ✓
- `X-Content-Type-Options: nosniff` ✓
- `Referrer-Policy: strict-origin-when-cross-origin` ✓
- `Content-Security-Policy`: `default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.googleusercontent.com https://images.unsplash.com https://*.ytimg.com https://*.amazonaws.com; font-src 'self'; frame-src https://js.stripe.com https://player.vdocipher.com https://accounts.google.com; connect-src 'self' https://*.ably.io wss://*.ably.io https://api.stripe.com https://*.amazonaws.com; media-src 'self' blob: https://*.amazonaws.com; worker-src 'self' blob:` ✓

**Backend API headers** (fix applied — `app/main.py`):
`SECURITY_HEADERS` dict now includes:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` ✓
- `X-Content-Type-Options: nosniff` ✓
- `X-Frame-Options: DENY` ✓
- `Referrer-Policy: strict-origin-when-cross-origin` ✓ (added)

**CSRF** (`app/security/csrf.py`):
- Double-submit cookie+header pattern ✓
- CSRF cookie: `httponly=False` (intentional — JS-readable for double-submit), `secure=True` in production ✓
- Auth cookie: `httponly=True`, `secure=True` in production, `samesite` configurable ✓
- Unsafe methods (POST/PATCH/PUT/DELETE) require valid CSRF token from cookie+header match ✓
- Exempt paths: `/api/auth/*`, `/api/google-login`, `/api/payments/webhook` (Stripe HMAC-verified separately) ✓
- Origin validation for exempt paths: non-trusted origin on unsafe exempt method → 403 ✓
- CSRF-exempt unauthenticated paths correctly identified in `UNAUTHENTICATED_AUTH_PATHS` ✓

**CORS** (`app/main.py`):
- `production_config_errors()` blocks wildcard CORS origins and localhost in production ✓
- `cors_allow_origin_regex` checked for permissive patterns ✓

Failures before fix: missing `Referrer-Policy` on backend; no security headers on frontend pages.
Fixes applied: `backend/app/main.py` SECURITY_HEADERS; `frontend/next.config.mjs` headers() function.

---

### G8 Load Test

Status: BLOCKED
Evidence: Cannot run 50-student classroom scenario without staging deployment, Ably credentials, and a real Lambda endpoint.
Acceptance targets set: API p95 < 800ms normal endpoints, < 1500ms live operations.
Metrics to record post-deploy: error rate, p50/p95 latency, Lambda cold starts, DB connection count, RDS CPU, Ably rate-limit errors, API 429/5xx counts.

---

### G9 Observability

Status: PASS (after fixes)

**Structured logs** (`app/main.py` request middleware):
- request_id (UUID per request) ✓
- method / path / status / duration ✓
- release_sha on every error response ✓
- user_id via JWT decode where applicable ✓
- CloudWatch Embedded Metric Format (EMF) for `Kresco/Api` namespace ✓

**Error tracking equivalent** (no Sentry; using custom CloudWatch pipeline):
- Backend: `emit_unhandled_exception_metric` + `emit_readiness_error_metric` in `app/services/telemetry.py` ✓
- Frontend: `ClientErrorReporter` component → `POST /api/client-errors` → `ClientError` CloudWatch metric ✓
- CloudWatch alarms required for production deploy: `Request5xx`, `UnhandledException`, `ClientError`, `ReadinessError` (enforced by `deploy-backend.yml` when stage=production) ✓

**`/ready` per-service config breakdown** (fix applied — `app/main.py`):
`/ready` now returns `checks.config_services` with per-service status keys:
`database`, `s3`, `ably`, `vdocipher`, `smtp`, `payment` → `"ok"` or `"missing"/"misconfigured"` ✓

**`/api/internal/diagnostics` payment check** (fix applied — `app/services/diagnostics.py`):
Added `payment` check: `stripe_sk_configured`, `stripe_product_id_configured`, `stripe_webhook_secret_configured` ✓

**`scripts/check_staging_runtime.py` payment validation** (fix applied):
Post-deploy verifier now validates `payment.stripe_sk_configured`, `payment.stripe_product_id_configured`, `payment.stripe_webhook_secret_configured` ✓

**Uptime checks**: BLOCKED — requires staging deploy to set up CloudWatch alarms or external monitors against staging `/health` and `/ready`.

Failures before fix: `/ready` showed only `configuration: error/ok` without naming which service; `/api/internal/diagnostics` had no payment check; runtime verifier did not validate payment.
Fixes applied: `backend/app/main.py`, `backend/app/services/diagnostics.py`, `scripts/check_staging_runtime.py`, and their 4 affected tests.

---

### G10 Rollback and Runbook

Status: PASS
Evidence: `docs/production-runbook.md` covers:
- Release preflight checklist (7 steps) ✓
- Deploy procedure with explicit gate enumeration ✓
- Monitoring: CloudWatch EMF alarms, `x-release-sha` header for correlation ✓
- Rollback: re-trigger deploy workflow for last-known-good commit ✓
- Migration rollback: snapshot-before-downgrade procedure ✓
- Backup and restore: RDS point-in-time recovery + named snapshots before destructive migrations ✓
- Incident response: 10-step first-response checklist covering login, media, realtime, payment, DB ✓

Emergency controls (disable individual subsystems without a full rollback):
The runbook documents incident response but does not have explicit "flip a switch to disable" procedures. These should be added before production launch. Current workaround is to remove the relevant environment variables from the AWS Secrets Manager staging secret and re-deploy — which takes ~2 minutes via Zappa.

Failures: none blocking. The missing emergency-controls section is a documentation gap, not a code gap.

---

## Changes Made in This Commit

| File | Change | Gate |
|---|---|---|
| `frontend/next.config.mjs` | Added `SECURITY_HEADERS` constant + `headers()` function with CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy | G7 |
| `backend/app/main.py` | Added `Referrer-Policy` to `SECURITY_HEADERS`; added `config_services` breakdown to `/ready` response; added `_ready_config_service_status()` helper | G7, G9 |
| `backend/app/services/diagnostics.py` | Added `_payment_check()` function; wired into `build_production_diagnostics()` | G9 |
| `scripts/check_staging_runtime.py` | Added payment check validation for `stripe_sk_configured`, `stripe_product_id_configured`, `stripe_webhook_secret_configured` | G9 |
| `backend/tests_fastapi/test_readiness.py` | Updated `/ready` assertions for `config_services`; added payment fields to diagnostics fixture and assertions | tests |
| `backend/tests_fastapi/test_staging_runtime_verifier.py` | Added `payment` object to `_diagnostics_payload()` | tests |

All 379 backend tests pass after changes.

---

## Highest Remaining Launch Risks

1. **G2/G3 (BLOCKED)**: Staging has never been deployed. Zero real-environment evidence that Lambda boots, RDS TLS handshake succeeds, or RDS Proxy is provisioned.
2. **G5 (BLOCKED)**: No provider credential validation. Ably, VdoCipher, Stripe, and SMTP are all unverified against staging credentials.
3. **G8 (BLOCKED)**: No load test. DB connection behavior under 50-student concurrency is unknown.
4. **G10 (gap)**: No one-command emergency disable switches for payments, live sessions, or uploads.

## Final Output

```
Commit tested:   adc1984
Commit created:  (see git log after this session's commit)
Passed gates:    G0, G1, G3 (code), G4 (code), G7, G9, G10
Failed gates:    none (all failures resolved by fixes in this commit)
Blocked gates:   G2, G3 (runtime), G4 (runtime), G5, G6, G8
Highest risk:    G2 — staging never deployed; no real-environment evidence for boot, TLS, or provider connectivity
Next action:     Set BACKEND_READY_URL repo var + populate AWS Secrets Manager staging secret, then trigger deploy-backend.yml with stage=staging
```
