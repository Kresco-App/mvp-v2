# Backend GCP Cost

## Summary
- Staging deploys start Cloud SQL and leave it running by default, which directly burns spend after every staging push.
- The backend production launch path can still run the stopped-db migration cleanup and patch Cloud SQL back to `NEVER`.
- Backend Cloud Run is deployed with `min-instances 0`; cold starts must load Secret Manager config and initialize DB/media clients before serving.
- No per-request Secret Manager access was found: settings are loaded through an `@lru_cache` path and injected into FastAPI dependencies.
- Current WIP is frontend-only; no findings touch modified or untracked files.

## Findings

### HIGH - Staging smoke leaves Cloud SQL running by default

Location: `.github/workflows/deploy-staging.yml:109`

Evidence:
- `.github/workflows/deploy-staging.yml:109` - `STOP_CLOUD_SQL_AFTER_SMOKE: "false"`
- `.github/workflows/deploy-staging.yml:147` - `if [ "${STOP_CLOUD_SQL_AFTER_SMOKE:-false}" = "true" ]; then`
- `.github/workflows/deploy-staging.yml:153` - `echo "Leaving Cloud SQL running for manual staging validation."`
- `.github/workflows/deploy-staging.yml:166` - `gcloud sql instances patch "$CLOUD_SQL_INSTANCE" \`
- `.github/workflows/deploy-staging.yml:168` - `--activation-policy ALWAYS \`

The workflow starts `kresco-staging-postgres` for smoke checks, but the default cleanup path deliberately does not stop it. That defeats the repo's declared staging cost posture in `infra/terraform/envs/staging/main.tf:50` - `activation_policy = "NEVER"` and creates persistent Cloud SQL spend after routine staging deploys.

Concrete fix: default `STOP_CLOUD_SQL_AFTER_SMOKE` to `"true"` and require an explicit `workflow_dispatch` input such as `keep_cloud_sql_running_for_manual_validation` for rare manual QA windows. Keep the `trap cleanup EXIT` path, but make the stop behavior the default and log the exact opt-in actor/run URL when the database is intentionally left running.

### HIGH - Production launch migrations can patch Cloud SQL back to `NEVER`

Location: `.github/workflows/deploy-backend.yml:252`

Evidence:
- `.github/workflows/deploy-backend.yml:201` - `if [ "$KRESCO_ENV" = "prod" ] && [ "${{ inputs.enforce_production_launch_gate }}" != "true" ]; then`
- `.github/workflows/deploy-backend.yml:202` - `deploy_flags+=(--no-traffic --tag "dark-$SHORT_SHA")`
- `.github/workflows/deploy-backend.yml:252` - `- name: Run migrations with stopped-db cleanup`
- `.github/workflows/deploy-backend.yml:257` - `gcloud sql instances patch "$CLOUD_SQL_INSTANCE" \`
- `.github/workflows/deploy-backend.yml:259` - `--activation-policy NEVER \`
- `.github/workflows/deploy-backend.yml:263` - `gcloud sql instances patch "$CLOUD_SQL_INSTANCE" \`
- `.github/workflows/deploy-backend.yml:265` - `--activation-policy ALWAYS \`

When `enforce_production_launch_gate=true`, the deploy no longer adds `--no-traffic`, but the migration step still installs an unconditional cleanup trap that patches the production Cloud SQL instance back to `activation-policy NEVER`. That is appropriate for dark/staging cost cleanup, but it conflicts with a full production cutover path.

Concrete fix: split the cleanup policy by launch mode. For staging and dark production, keep the current stopped-db cleanup. For production with `enforce_production_launch_gate=true`, either skip the cleanup trap or add a `stop_cloud_sql_after_migrations` input that defaults to `false` only for the full production launch path. Add a workflow assertion that full production deploys finish with Cloud SQL `activationPolicy=ALWAYS`.

### MEDIUM - Production backend cold starts include runtime secret and client initialization

Location: `.github/workflows/deploy-backend.yml:208`

Evidence:
- `.github/workflows/deploy-backend.yml:208` - `--min-instances 0 \`
- `.github/workflows/deploy-backend.yml:211` - `--update-env-vars "KRESCO_ENV=$KRESCO_ENV,KRESCO_RELEASE_SHA=$SHORT_SHA,KRESCO_GCP_RUNTIME_SECRET_NAME=projects/$PROJECT_ID/secrets/kresco-runtime/versions/latest" \`
- `backend/app/config.py:443` - `@lru_cache`
- `backend/app/config.py:445` - `return Settings(**load_runtime_secret_overrides())`
- `backend/app/config.py:465` - `response = client.access_secret_version(request={"name": secret_name})`
- `backend/app/main.py:162` - `engine, _ = init_engine(`
- `backend/app/main.py:170` - `await warm_media_storage_client(settings)`
- `backend/app/main.py:177` - `settings = get_settings()`

The Secret Manager access is cached rather than per-request, which is good. The remaining latency issue is cold starts: with zero warm backend instances, the first request after scale-to-zero must create settings from Secret Manager and initialize the database/media runtime before the service is ready.

Concrete fix: keep `--min-instances 0` for staging and dark production, but make full production launch deploys set at least one warm backend instance, for example by deriving `backend_min_instances=1` when `inputs.environment == 'production' && inputs.enforce_production_launch_gate == true`. If keeping zero warm instances is intentional, move cold-start-sensitive runtime config to Cloud Run secret env injection and keep startup work minimal.

### MEDIUM - Backend DB pool defaults can exceed the small Cloud SQL staging footprint

Location: `backend/app/config.py:158`

Evidence:
- `backend/app/config.py:158` - `database_pool_size: int = Field(`
- `backend/app/config.py:159` - `default=10,`
- `backend/app/config.py:162` - `database_max_overflow: int = Field(`
- `backend/app/config.py:163` - `default=20,`
- `backend/app/main.py:165` - `pool_size=settings.database_pool_size,`
- `backend/app/main.py:166` - `max_overflow=settings.database_max_overflow,`
- `.github/workflows/deploy-backend.yml:209` - `--max-instances 3 \`
- `infra/terraform/envs/staging/main.tf:48` - `tier              = "db-custom-1-3840"`

The checked-in backend defaults allow up to `3 * (10 + 20) = 90` pooled/overflow database connections from the backend service before counting the migration job or any one-off scripts. For the declared one-vCPU staging Cloud SQL tier, that pool budget can create avoidable connection pressure, latency, and pressure to upsize the database.

Concrete fix: explicitly size `DATABASE_POOL_SIZE`, `DATABASE_MAX_OVERFLOW`, and `DATABASE_POOL_TIMEOUT` in `kresco-runtime` per environment, then add a workflow or test guard that checks `max_instances * (pool_size + max_overflow)` against the approved Cloud SQL connection budget. For the current staging footprint, start with a much smaller pool budget and raise it only with load-test evidence.

## Leads

1. `backend/app/config.py` - Verify the live `kresco-runtime` secret in both `kresco-staging` and `kresco-prod` contains intentional `DATABASE_POOL_SIZE`, `DATABASE_MAX_OVERFLOW`, and `DATABASE_POOL_TIMEOUT` values; these are loaded from Secret Manager at startup but cannot be verified from the repository.
2. `infra/terraform/envs/production/main.tf` - Verify whether production Cloud Run and Cloud SQL are intentionally unmanaged by Terraform; if live `kresco-prod` resources already exist, compare their actual min/max instances, Cloud SQL tier, disk size, and activation policy against the workflow defaults before launch.
