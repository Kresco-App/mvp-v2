# Production Runbook

## Release Preflight

1. Confirm the target GitHub Environment selects the correct GCP project: `kresco-staging` or `kresco-prod`.
2. Confirm backend runtime secrets are available through `KRESCO_GCP_RUNTIME_SECRET_NAME=projects/$PROJECT_ID/secrets/kresco-runtime/versions/latest`.
3. Confirm `DATABASE_URL` points at managed Postgres, includes `sslmode=verify-full`, and uses `PGSSLROOTCERT=certifi`.
4. Confirm `DATABASE_CONNECTION_STRATEGY=cloud_sql` or `DATABASE_CONNECTION_STRATEGY=alloydb`.
5. Confirm `MEDIA_STORAGE_BACKEND=gcs`, `MEDIA_GCS_BUCKET`, `MEDIA_GCS_PREFIX`, quota settings, and lifecycle retention are configured.
6. Confirm Firebase Auth and Firestore values match the same project as the deployed frontend.

## Deploy

1. Run the backend deploy workflow with production-dark confirmation enabled.
2. Let the workflow build the backend image, push it to Artifact Registry, deploy the Cloud Run service, execute the migration job, and verify `/ready`.
3. Run the frontend deploy workflow after the backend URL is known.
4. Do not attach domains or route users during dark production.
5. Capture `/ready` and protected `/api/internal/diagnostics` output as launch evidence.

## Monitoring

Backend request, readiness, exception, and `ClientError` events are emitted as structured JSON in the `Kresco/Api` metric namespace. Frontend route errors, widget boundary crashes, `window.onerror`, and unhandled promise rejections are posted to `/api/client-errors`, which emits the `ClientError` metric without storing raw user routes or stack text.

## Rollback

1. Stop routing new traffic to the bad Cloud Run revision.
2. Roll back to the previous known-good Cloud Run revision.
3. Re-run `/ready` and `/api/internal/diagnostics`.

## Migration Rollback

1. Pause writes before any database downgrade.
2. Prefer forward repair when possible.
3. If downgrade is required, restore from the latest verified managed Postgres backup.

## Backup And Restore

1. Keep automated managed Postgres backups enabled for staging and production.
2. Run a staging restore drill before production cutover.
3. Attach the restore drill evidence to `OPS-RUNBOOK-001`.

## Incident Response

1. Check Cloud Run service health and recent revision logs.
2. Check `/ready` and `/api/internal/diagnostics` with the internal secret.
3. If login is affected, verify Firebase project values and Google OAuth client configuration.
4. If media is affected, verify private Cloud Storage object access, signed URL generation, bucket prefix scope, and lifecycle rules.
5. If realtime is affected, verify Firestore configuration, outbox status, and protected outbox drain execution.
6. If database connectivity is affected, verify Cloud SQL or AlloyDB instance state, connection name, TLS settings, and migration head state.
