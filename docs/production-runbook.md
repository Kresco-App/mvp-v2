# Production Runbook

Production remains frozen until the traceability gate says otherwise. Use this runbook for staging drills first; do not promote a step to production unless the same commit has passed staging diagnostics.

## Release Preflight

1. Confirm the target GitHub Environment has separate `DATABASE_URL`, `MEDIA_S3_BUCKET`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `REALTIME_OUTBOX_SECRET`, JWT, CMI, Resend, Ably, Google, and VdoCipher secrets.
2. Confirm `DATABASE_URL` points at the RDS Proxy endpoint, includes `sslmode=verify-full`, and uses `PGSSLROOTCERT=certifi` for the AWS Certificate Manager / Amazon Trust Services certificate chain used by RDS Proxy.
3. Confirm backend Zappa settings for the stage use `DATABASE_CONNECTION_STRATEGY=rds_proxy`, `memory_size >= 1024`, `timeout_seconds >= 45`, and `keep_warm=true`.
4. Confirm the S3 bucket has Block Public Access, no public read policy, and lifecycle rules for the stage prefix.
5. Confirm `CLOUDWATCH_ALARM_NAMES` is configured on the production GitHub Environment and points to alarms covering `Request5xx`, `UnhandledException`, `ClientError`, and `ReadinessError` from the `Kresco/Api` metric namespace.
6. Run `python scripts/check_production_launch_gate.py` locally before any attempted production workflow. It must fail during the freeze and pass only after the traceability rows and readiness score are complete.
7. Run the backend deploy workflow manually against `staging`.

## Deploy

1. Trigger `.github/workflows/deploy-backend.yml` with `stage=staging`.
2. Verify the workflow completes these gates: repository hygiene, Alembic upgrade on disposable Postgres, data-integrity audit, backend tests, real migration, Zappa render, Lambda deploy/update, outbox schedule, and `scripts/check_staging_runtime.py`.
3. Confirm the runtime verifier checked `/ready`, `/api/internal/diagnostics`, RDS Proxy declaration, S3 media configuration, migration heads, realtime outbox health, video/email config, and the protected outbox-drain endpoint.
4. If the runtime verifier fails, treat the stage as not deployed and do not proceed to smoke testing.
5. Smoke the staging frontend against the staging backend.
6. Promote the same commit to `production` only after the staging evidence is attached to the launch gate.

## Monitoring

Backend Lambda writes CloudWatch Embedded Metric Format JSON for the `Kresco/Api` namespace on every request and server-side failure. Frontend route errors, widget boundary crashes, `window.onerror`, and unhandled promise rejections are posted to `/api/client-errors`, which emits the `ClientError` metric.

Production must have alarms for:

1. `Request5xx` greater than zero over a short window.
2. `UnhandledException` greater than zero.
3. `ClientError` above the agreed client-error budget.
4. `ReadinessError` greater than zero.

The production backend deploy workflow refuses to proceed unless `CLOUDWATCH_ALARM_NAMES` lists existing alarms for this set. During an incident, correlate browser reports, backend request IDs, and the `x-release-sha` response header with the alarm time window.

## Rollback

Use rollback for application regressions where database schema and data remain compatible with the previous commit.

1. Stop promotion. If production is affected, announce production freeze in the incident channel.
2. Identify the last known-good commit and its successful staging evidence.
3. Re-run the backend deploy workflow for that commit and target stage.
4. Re-run `/ready` and `/api/internal/diagnostics`.
5. Run the failing user journey again and record the outcome in the traceability evidence log.

## Migration Rollback

Do not run schema downgrade commands blindly on production. Prefer a forward fix unless data loss or schema incompatibility makes that unsafe.

1. Determine the current Alembic head from `/api/internal/diagnostics`.
2. Compare it with the expected heads in the deployed commit.
3. If a downgrade is required, take a fresh RDS snapshot first.
4. Test the downgrade against a restored staging copy.
5. Run the exact Alembic command only after the rollback owner and database owner approve it.
6. Re-run diagnostics and the affected browser/API journeys.

## Backup And Restore

1. Keep automated RDS backups enabled for staging and production with point-in-time recovery.
2. Before destructive migrations, create a manual snapshot named with stage, commit SHA, and UTC timestamp.
3. Test restore by creating a staging database from the snapshot, applying migrations to the target commit, and running `/api/internal/diagnostics`.
4. For production restore, restore into a new database/proxy target first. Do not overwrite the old database in place.
5. Switch the stage `DATABASE_URL` secret to the restored proxy endpoint only after diagnostics pass.

## Incident Response

Use this first-response checklist for broken login, watch, stream, upload, realtime, or payment flows.

1. Capture the failing URL, account role, request ID, UTC time, browser console error, and backend status code.
2. Check `/ready`.
3. Check `/api/internal/diagnostics`.
4. Inspect CloudWatch logs and `Kresco/Api` alarms for the request ID, release SHA, Lambda errors, `ClientError`, `Request5xx`, `UnhandledException`, and `ReadinessError`.
5. If media is affected, verify S3 private-object access and presigned URL generation.
6. If realtime is affected, inspect `realtime_outbox` dead/retry counts and the scheduled worker invocation.
7. If database connectivity is affected, verify RDS Proxy target health and TLS certificate validation.
8. Roll back the app if a recent deploy caused the incident and schema compatibility is safe.
9. Restore from backup only if rollback cannot repair the data or schema state.
10. Record the root cause, mitigation, and missing test/runbook gap before unfreezing.
