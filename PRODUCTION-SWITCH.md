# Production Switch

## Current Readiness Gate

Stripe billing is intentionally deferred for this gate. Do not count billing/subscription readiness in the score below until Stripe is pulled back into scope.

Current non-Stripe launch readiness: **5.5/10**.

Target for broad student production: **9/10**.

The production switch is not approved until the non-Stripe gates below are complete.

Executable guard: `python scripts/check_production_launch_gate.py` must pass before any production backend or frontend deploy. It currently fails by design while traceability rows are not `verified` or the readiness score is below target.

## Required Gates To Reach 9/10

### Backend-Backed E2E Coverage

The current Playwright smoke suite is useful, but it mostly proves that pages render against mocked API fixtures. Add a separate backend-backed integration E2E suite before broad launch.

Checklist:

- Keep the existing mocked smoke suite for hydration and route rendering.
- Add a separate Playwright integration config that runs against the real FastAPI backend and an isolated test database.
- Seed a real student, professor, subject, topic, chapter, section, and access/progress state.
- Cover student login -> home -> topic -> watch page with real backend data.
- Cover the watch route N+1 regression: opening one section must call the direct watch-context endpoint, not enumerate all subjects/chapters.
- Cover professor action -> student-visible result for at least one live/chat/content flow.
- Mock only external vendors such as Google OAuth, Stripe, and video providers; do not blanket-mock internal `POST`/`PATCH` calls.

### Realtime Hardening

Realtime must fail visibly and degrade intentionally. Silent delivery failure is not acceptable for production.

Checklist:

- Stop silently swallowing Ably publish failures.
- Add structured logs/metrics for Ably token minting, subscribe failures, publish failures, reconnects, and fallback polling activation.
- Add retry/backoff or a durable fallback path for important professor/student realtime events.
- Add at least one browser-level test with realtime enabled or a local fake Ably adapter.
- Validate that polling fallback works, but do not treat polling-only tests as proof that realtime works.
- Review fanout paths so notifying many students does not open a fresh HTTP client and publish sequentially for every recipient.

### API Contract And Data Integrity

The frontend and backend must agree on production payloads, not just mocked fixtures.

Checklist:

- Add contract tests for `watch-context`, topic workspace, stream access, comments, PDFs, progress, and professor live/chat payloads.
- Verify locked/free/pro access behavior from backend state, not frontend assumptions.
- Test empty, missing, forbidden, expired-token, and server-error states for the core student journey.
- Keep fixtures realistic: multiple subjects, multiple chapters, locked and unlocked sections, and a realistic topic like "Limits and continuity".

### Demo And Shell Cleanup

Demo-only behavior must not leak into production.

Checklist:

- Disable or protect demo login outside local development.
- Remove fake JWT/localStorage shortcuts from production-like tests.
- Remove fake video fallbacks from production paths or gate them behind explicit local/demo flags.
- Move hardcoded marketing/product numbers into content/config so they are not treated as verified platform facts.
- Audit local defaults such as localhost API URLs, local CORS values, and weak development secrets before deploy.

### Observability And Operations

Production needs enough visibility to debug student-impacting failures quickly.

Checklist:

- Add request/error logging around auth, watch-context, stream access, comments/PDFs, progress writes, professor actions, and realtime publish.
- Add health checks for backend, database, media provider configuration, and realtime configuration.
- Define rollback and incident steps for broken watch page, broken login, broken stream access, and broken professor live/chat flows.
- Run a small load/performance check for topic page, watch page, and live/chat flows with realistic course size.
- Run `python scripts/audit_query_plans.py` against Postgres after migrations and attach the output to the launch gate.

## Database TLS Verification

Before switching production to PostgreSQL/RDS, use full certificate and hostname verification.

Checklist:

- Bundle the Amazon RDS CA PEM with the backend deployment, for example `backend/certs/rds-global-bundle.pem`.
- Set `PGSSLROOTCERT` in the deployed backend environment to the deployed absolute path, for example `/var/task/certs/rds-global-bundle.pem`.
- Set production `DATABASE_URL` to use the real RDS/RDS Proxy hostname and `sslmode=verify-full`.
- Do not use an IP address in `DATABASE_URL`; `verify-full` requires the hostname to match the certificate.

Expected production shape:

```text
DATABASE_URL=postgresql://USER:PASSWORD@your-db.xxxxxx.eu-north-1.rds.amazonaws.com:5432/kresco?sslmode=verify-full
PGSSLROOTCERT=/var/task/certs/rds-global-bundle.pem
```
