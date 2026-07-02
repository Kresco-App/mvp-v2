# DevOps Workflow Verification

## Summary
- `git status --short` was run first. It showed `.github/workflows/deploy-backend.yml` modified and `docs/audits/` untracked, so findings against `deploy-backend.yml` are marked `[WIP-PROVISIONAL]`.
- Read `docs/audits/_state.md`, `docs/audits/00-MASTER-REPORT.md`, `docs/audits/W2-03-devops-patch-validation.md`, and all current `.github/workflows/*` files.
- `actionlint` is unavailable locally: `Get-Command actionlint` failed with "The term 'actionlint' is not recognized". Static YAML/expression inspection was performed instead.
- Verified PR-only CI cancellation: backend and frontend CI use PR-number concurrency groups with `github.run_id` fallback and `cancel-in-progress` only on `pull_request`.
- Verified staging deploy CI skip/gate shape: staging CI jobs run only for non-master manual dispatch, and deploy uses `!cancelled()` plus explicit `success`/`skipped` checks.
- Verified Buildx registry cache for backend and frontend Docker builds.
- Verified production launch backend min instances are set to 1 when `enforce_production_launch_gate=true`.
- Verified nightly staging Cloud SQL stop uses the shared `staging-cloud-sql-${{ github.repository }}` concurrency group.
- Not verified: backend Cloud SQL cleanup after migrations and staging smoke default stop behavior still do not meet the stated target.

## Findings - severity, exact file:line, quoted evidence, concrete fix

### HIGH [WIP-PROVISIONAL] - Backend migrations start Cloud SQL but never stop it for staging or dark production

Evidence:
- `.github/workflows/deploy-backend.yml:264` quotes `- name: Run migrations`.
- `.github/workflows/deploy-backend.yml:268` quotes `gcloud sql instances patch "$CLOUD_SQL_INSTANCE" \`.
- `.github/workflows/deploy-backend.yml:270` quotes `--activation-policy ALWAYS \`.
- `.github/workflows/deploy-backend.yml:284` quotes `gcloud run jobs execute "$MIGRATION_JOB" \`.
- `.github/workflows/deploy-backend.yml:304` quotes `- name: Verify backend release health`.

The migration step starts Cloud SQL before running Alembic, then falls through to release-health verification. There is no `cleanup` trap and no `--activation-policy NEVER` in `deploy-backend.yml`, so staging and dark-production migration runs can leave Cloud SQL running. This fails the launch-mode-scoped cleanup requirement, even though production launch warm instances are correctly handled at `.github/workflows/deploy-backend.yml:213` (`if [ "$KRESCO_ENV" = "prod" ] && [ "${{ inputs.enforce_production_launch_gate }}" = "true" ]; then`), `.github/workflows/deploy-backend.yml:214` (`backend_min_instances=1`), and `.github/workflows/deploy-backend.yml:220` (`--min-instances "$backend_min_instances" \`).

Concrete fix: add a migration cleanup trap after the `ALWAYS` patch and before the wait loop. The trap should patch `--activation-policy NEVER` only when the deploy is staging or dark production, and skip cleanup only for full production launch, for example when `KRESCO_ENV=prod` and `inputs.enforce_production_launch_gate == true`.

### HIGH - Staging smoke still leaves Cloud SQL running by default instead of requiring an explicit keep-running input

Evidence:
- `.github/workflows/deploy-staging.yml:18` quotes `stop_cloud_sql_after_smoke:`.
- `.github/workflows/deploy-staging.yml:21` quotes `default: false`.
- `.github/workflows/deploy-staging.yml:118` quotes `STOP_CLOUD_SQL_AFTER_SMOKE: ${{ github.event_name == 'workflow_dispatch' && inputs.stop_cloud_sql_after_smoke == true }}`.
- `.github/workflows/deploy-staging.yml:156` quotes `if [ "${STOP_CLOUD_SQL_AFTER_SMOKE:-false}" = "true" ]; then`.
- `.github/workflows/deploy-staging.yml:162` quotes `echo "Leaving Cloud SQL running; scheduled stop workflow handles cost control."`.
- `.github/workflows/deploy-staging.yml:175` quotes `gcloud sql instances patch "$CLOUD_SQL_INSTANCE" \`.
- `.github/workflows/deploy-staging.yml:177` quotes `--activation-policy ALWAYS \`.

Push-triggered staging deploys and default manual dispatches set `STOP_CLOUD_SQL_AFTER_SMOKE` to false, then the cleanup path deliberately leaves Cloud SQL running. This fails the requirement that staging smoke stops Cloud SQL by default with an explicit manual keep-running input.

Concrete fix: invert the manual input to `keep_cloud_sql_running_after_smoke` with `default: false`, and derive `STOP_CLOUD_SQL_AFTER_SMOKE` as true unless `github.event_name == 'workflow_dispatch' && inputs.keep_cloud_sql_running_after_smoke == true`. Keep the existing `trap cleanup EXIT`, but make the default cleanup patch `--activation-policy NEVER`.

## Leads - remaining questions or `None`

None.
