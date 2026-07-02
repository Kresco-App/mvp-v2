# DevOps Patch Validation Follow-up

## Summary
- Hard constraints repeated verbatim:
  - The working tree contains uncommitted WORK IN PROGRESS. Audit code as it is on disk, but run `git status` first; findings in modified/untracked files must be marked `[WIP-PROVISIONAL]`.
  - Agents are READ-ONLY for all existing files. Never edit source, tests, or config. The ONLY permitted file output is the agent's own report under `docs/audits/` (create the directory if needed).
  - Exception: Agent 9 (DevOps implementer) is the single writer. It must work in an ISOLATED GIT WORKTREE (or, if the harness lacks worktree isolation, it must write only `.patch` files to `docs/audits/patches/` and never touch the working tree).
  - Read entire files, not excerpts. Verify every claim against actual code before reporting it. No speculation presented as fact.
- `git status --short` first showed `M frontend/app/page.tsx`, `?? docs/audits/`, and `?? frontend/components/landing/`; findings tied to the untracked patch artifact are marked `[WIP-PROVISIONAL]`.
- Read the required audit files and the full affected workflow/config files before reporting. `git apply --check docs/audits/patches/09-devops-workflows.patch` passed.
- Manual workflow-expression inspection found no GitHub Actions expression validity issue in the patch: PR-only CI concurrency uses `github` context with a `github.run_id` fallback at `docs/audits/patches/09-devops-workflows.patch:8-10` and `docs/audits/patches/09-devops-workflows.patch:23-25`; the staging deploy gate explicitly accepts only `success` or `skipped` CI needs after `!cancelled()` at `docs/audits/patches/09-devops-workflows.patch:164`.
- `actionlint` is not installed locally, so no actionlint run was performed.

## Findings - severity, exact file:line or patch hunk evidence, concrete fix

### HIGH [WIP-PROVISIONAL] - Cloud SQL cleanup is not launch-mode scoped and staging still defaults to leaving the database running

Evidence:
- The patch removes the backend migration cleanup trap unconditionally: `docs/audits/patches/09-devops-workflows.patch:81-92` deletes `Run migrations with stopped-db cleanup`, the `cleanup()` function, and `trap cleanup EXIT`; `docs/audits/patches/09-devops-workflows.patch:93-95` leaves only the `--activation-policy ALWAYS` startup.
- The existing staging smoke job still defaults to not stopping Cloud SQL: `.github/workflows/deploy-staging.yml:109` sets `STOP_CLOUD_SQL_AFTER_SMOKE: "false"`, and `.github/workflows/deploy-staging.yml:146-153` only patches `--activation-policy NEVER` when that value is true.
- The staging smoke still starts the instance with `--activation-policy ALWAYS` at `.github/workflows/deploy-staging.yml:166-169`.
- The patch adds a nightly stop job at `docs/audits/patches/09-devops-workflows.patch:173-218`, with the stop patch at `docs/audits/patches/09-devops-workflows.patch:214-216`, but that is delayed cleanup and does not cover direct staging deploys immediately or dark-production deploys at all.

Concrete fix: make Cloud SQL stop behavior launch-mode aware. Keep stop-after-migrations for staging and dark production, skip it only for `inputs.environment == 'production' && inputs.enforce_production_launch_gate == true`, and set staging smoke to stop by default with an explicit manual keep-running input for QA windows. Keep the nightly staging stop as a safety net, not as the primary cleanup mechanism.

### MEDIUM [WIP-PROVISIONAL] - Full production backend launch still uses zero warm instances

Evidence:
- The workflow distinguishes dark production from full production at `.github/workflows/deploy-backend.yml:201-202` by adding `--no-traffic --tag` only when `enforce_production_launch_gate` is not true.
- The Cloud Run deploy command still always sets `.github/workflows/deploy-backend.yml:208` to `--min-instances 0`, with `--max-instances 3` at `.github/workflows/deploy-backend.yml:209`.
- The patch changes Buildx/cache and migration cleanup hunks but does not add a production-launch `min-instances` branch.

Concrete fix: derive backend min instances from launch mode, for example `BACKEND_MIN_INSTANCES=1` when `inputs.environment == 'production' && inputs.enforce_production_launch_gate == true` and `0` otherwise, pass that value to `gcloud run deploy`, and assert the deployed service min-instance setting after deploy.

## Leads - precise remaining external-state questions or `None`

- External-state: verify the live Secret Manager `kresco-runtime` secret in both `kresco-staging` and `kresco-prod` contains intentional `DATABASE_POOL_SIZE`, `DATABASE_MAX_OVERFLOW`, and `DATABASE_POOL_TIMEOUT` values. Repo defaults remain `10`, `20`, and `30` at `backend/app/config.py:158-167`; checking the deployed values requires GCP credentials and secret access.
- External-state: `infra/terraform/envs/production/main.tf:1-4` states production is intentionally not instantiated yet. Verify in GCP whether `kresco-prod` Cloud Run and Cloud SQL resources already exist, and if so whether their min/max instances, Cloud SQL tier, disk size, and activation policy are intentionally unmanaged/manual until launch approval.
