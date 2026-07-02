# Kresco DevOps Master Plan

Last verified: 2026-07-02

## Goal

Make staging fast without weakening production safety.

The current staging workflow is slow because it does all of this in one path:

1. Frontend CI.
2. Backend CI.
3. Backend image build and Cloud Run deploy.
4. Cloud SQL start, migrations, backend readiness checks, then Cloud SQL stop.
5. Frontend image build and Cloud Run deploy.
6. Firebase Hosting edge deploy.
7. Broad staging smoke and provider checks.

The current target is:

- Normal staging deploy: 3 to 7 minutes.
- Deep staging evidence: separate workflow, run manually, nightly, or before production.
- Production: deploy the exact artifact already verified in staging.
- Rollback: available before production promotion work.

## Operating Principle

Remove wasted work first.
Do not replace removed waste with new machinery.
Add safety primitives before deployment granularity.

## Final Implementation Order

### 1. Move Cloud SQL Stop Out Of The Deploy Pipeline

The current waste is the mid-pipeline stop/start cycle:

- `deploy-backend.yml` starts Cloud SQL for migrations.
- `deploy-backend.yml` stops Cloud SQL in its cleanup trap.
- `deploy-staging.yml` starts Cloud SQL again for staging smoke.

Change:

- Remove the cleanup trap in `.github/workflows/deploy-backend.yml` that patches staging Cloud SQL to `activation-policy NEVER`.
- Keep migrations unconditional.
- Add a separate scheduled/manual workflow to stop staging Cloud SQL outside the deployment path.
- Keep the existing start/wait logic before migrations so a deploy still works if the database is already stopped.

Reason:

- The expensive part is Cloud SQL becoming `RUNNABLE`, not Alembic itself.
- Against a warm database, `alembic upgrade head` with no pending revisions is cheap.
- Keeping migrations unconditional prevents staging schema drift and avoids fragile path-filter logic.

Suggested scheduled stop workflow:

- Name: `Stop Staging Cloud SQL`.
- Schedule: nightly, outside active development hours.
- Manual dispatch: enabled.
- Project: `kresco-staging`.
- Instance: `kresco-staging-postgres`.
- Action: `gcloud sql instances patch kresco-staging-postgres --activation-policy NEVER`.

The scheduled stop workflow must join the same concurrency group as staging deploys:

```yaml
concurrency:
  group: staging-cloud-sql-${{ github.repository }}
  cancel-in-progress: false
```

This prevents the scheduled stop from patching Cloud SQL while a deploy is running migrations or staging smoke checks.

Implementation order:

1. First PR: remove only the `deploy-backend.yml` cleanup trap.
2. Measure the next staging deploy timing.
3. Second PR: add the scheduled/manual Cloud SQL stop workflow.

After the first PR, staging Cloud SQL will stay running until the scheduled workflow exists or someone stops it manually. That is acceptable for measurement, but do not leave it unmanaged for long.

Note:

- The existing Cloud SQL start-and-wait block in `deploy-staging.yml` becomes a harmless no-op against a warm instance. It can be simplified later, but it does not need to change in step 1.

### 2. Skip Deploy-Embedded CI Only On Protected Master

Do not remove CI from staging deploy for every trigger.

Manual `workflow_dispatch` can run from feature branches, and branch protection does not protect that path. Branch dispatches must still run CI before deployment.

Change in `.github/workflows/deploy-staging.yml`:

- Keep `backend-ci` and `frontend-ci`.
- Run those CI jobs only for manual dispatches from non-master branches.
- Skip those CI jobs for normal pushes to protected `master`.

Required job condition:

```yaml
backend-ci:
  name: Backend CI
  if: github.event_name == 'workflow_dispatch' && github.ref != 'refs/heads/master'
  uses: ./.github/workflows/ci-backend.yml

frontend-ci:
  name: Frontend CI
  if: github.event_name == 'workflow_dispatch' && github.ref != 'refs/heads/master'
  uses: ./.github/workflows/ci-frontend.yml
```

Deploy jobs must use success-or-skipped gating. Do not use naive `always()`.

Required deploy gate:

```yaml
if: >
  !cancelled() &&
  (needs.backend-ci.result == 'success' || needs.backend-ci.result == 'skipped') &&
  (needs.frontend-ci.result == 'success' || needs.frontend-ci.result == 'skipped')
```

Expected behavior:

- Protected `master` push: deploy-embedded CI is skipped, deploy proceeds.
- Manual branch dispatch: deploy-embedded CI runs, deploy proceeds only if CI passes.
- Failed CI: deploy is blocked.
- Cancelled run: deploy is blocked.

### 3. Verify Branch Protection Before Relying On Skipped Deploy CI

Before deploy-embedded CI is skipped on `master`, GitHub branch protection must be verified.

Manual requirement:

- Protect branch: `master`.
- Require PR checks before merge.
- Required PR-triggered checks:
  - `Backend CI / test`
  - `Frontend CI / verify`

Important:

- Required check names must match the direct PR checks.
- Do not rely on the reusable workflow names shown inside `Deploy Staging`, such as `Deploy Staging / Backend CI / test`.
- Confirm once that a PR with a failing required check is actually blocked from merge.

### 4. Add PR CI Cancel-In-Progress

Add concurrency to PR CI workflows so old runs are cancelled when a new commit is pushed to the same PR branch.

Apply to:

- `.github/workflows/ci-backend.yml`
- `.github/workflows/ci-frontend.yml`

Pattern:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

Do not casually cancel staging deploys mid-flight. Deployment concurrency should stay conservative.

### 5. Add Docker Build Caching

The current Docker deploys use `docker build --pull` with no explicit cache strategy.

Change:

- Use Buildx for backend and frontend images.
- Add GHA cache or registry-backed cache.
- Keep image tags and digest outputs.
- Preserve authentication to Artifact Registry.

Apply to:

- `.github/workflows/deploy-backend.yml`
- `.github/workflows/deploy-frontend.yml`

This is a real speed win and does not require changing application behavior.

### 6. Finish Sentry Correctly

Frontend Sentry setup is in progress under `frontend/`.

Required cleanup:

- Remove `frontend/app/sentry-example-page/` before staging or production.
- Clean `frontend/next.config.mjs` so org/project/token come from environment variables.
- Keep Sentry Replay privacy-safe for student, admin, professor, and staff data.
- Preserve the existing Kresco error UI and client telemetry.
- Add backend FastAPI Sentry SDK setup.
- Ensure frontend source maps upload during Docker builds.

Sentry auth token rule:

- Do not bake `SENTRY_AUTH_TOKEN` into Docker image layers.
- Pass it as a BuildKit secret only during `npm run build`.

Sentry auth token scopes:

- `project:releases`
- `org:read`

### 7. Add Cloud Run Rollback Workflow

Add a manual rollback workflow before production promotion work.

Goal:

- One-click/manual rollback by Cloud Run revision name.
- Support staging first, then production.
- Use captured revision names from deploy summaries and GitHub Actions outputs.

Before implementing rollback, inspect the backend health/readiness code and confirm where `release_sha` comes from:

- Cloud Run revision environment variable.
- `kresco-runtime` Secret Manager latest version.
- Some combination of both.

This matters because every backend deploy currently writes `KRESCO_RELEASE_SHA` into two places:

- Cloud Run revision env vars.
- A new version of the `kresco-runtime` secret.

Cloud Run rollback restores the old revision env vars, but it does not roll back Secret Manager `versions/latest`. If `/health` reports the release from the secret, a healthy rollback could report the wrong SHA and fail verification.

Rollback scope must also be explicit:

- Backend Cloud Run rollback.
- Frontend Cloud Run rollback.
- Firebase Hosting edge rollback, if needed. Firebase Hosting has its own rollback path and should not be treated as identical to Cloud Run revision rollback.

Critical migration rule:

Rollback shifts traffic to a previous Cloud Run revision. It does not roll back the database.

Therefore:

- Migrations must be backward-compatible.
- Use expand/contract:
  - Additive schema first.
  - Deploy code that can read both old and new shapes.
  - Remove old schema only in a later release after all old code is gone.

This rule must be written into the rollback runbook.

### 8. Promote By Image Digest

Production should not rebuild from source if staging already verified an image.

Change:

- Staging builds backend and frontend images.
- Staging records image digests.
- Production-dark deploys the exact staging-verified digests.
- Production-live promotes traffic after verification.

Implementation constraint:

- Staging images currently live in the `kresco-staging` Artifact Registry project.
- Production deploys run in the `kresco-prod` project.

Before writing the promotion workflow, choose one approach:

1. Grant the production deploy identity read access to the staging Artifact Registry repository.
2. Copy verified images into the production Artifact Registry and deploy from there.

The second option is cleaner for production ownership, but it requires a digest-preserving copy strategy such as `gcrane cp` or equivalent pull/push tooling. Do not assume `gcloud artifacts docker tags add` can promote images across projects.

This matters more for production safety than runner speed.

Current implementation status:

- Backend digest promotion is implemented via `.github/workflows/promote-production-backend.yml`.
- The workflow takes the verified staging backend digest and release SHA, copies that digest into the production Artifact Registry as `kresco-backend:promoted-<release_sha>`, verifies the copied digest matches exactly, then reuses `.github/workflows/deploy-backend.yml` with `backend_image` and `release_sha` inputs.
- The existing backend deploy workflow still builds from source by default. It only skips the build when a trusted caller supplies an existing backend image under the target environment's Artifact Registry repository.
- Frontend digest promotion is deliberately not implemented yet. The current Next.js image bakes environment-specific public build values into the bundle, including `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`, Firebase public config, Sentry environment, backend origin, and release SHA. Promoting the exact staging frontend image to production would ship staging public config to production.

Frontend promotion decision still required:

- Make the frontend image runtime-configurable despite Next.js public env constraints.
- Or build a production-shaped candidate image and verify that exact production-shaped image in staging-like infrastructure before promotion.
- Or keep frontend rebuilds for production while backend uses digest promotion.

External IAM configured for backend promotion:

- The production deploy service account must read the staging Artifact Registry repository and write the production Artifact Registry repository.
- Current production deploy service account:
  `github-deployer@kresco-prod.iam.gserviceaccount.com`
- Staging repository reader grant configured:
  `roles/artifactregistry.reader` on `projects/kresco-staging/locations/europe-southwest1/repositories/kresco-containers`
- Production writer grant verified:
  `roles/artifactregistry.writer` on `projects/kresco-prod` for `github-deployer@kresco-prod.iam.gserviceaccount.com`

### 9. Consider Path-Aware Deploys Only Later

Do not partial-deploy backend/frontend yet.

Current verification expects both services to expose the same release SHA via `--expected-sha`.

Before partial deploys:

- Verification must support backend/frontend SHA skew.
- Deployment summaries must report `backend_sha` and `frontend_sha` separately.
- Smoke checks must know which service was intentionally updated.

Until then, deploy both services together.

Current implementation status:

- `scripts/check_staging_deployment.py` accepts `--expected-backend-sha` and `--expected-frontend-sha`, falling back to `--expected-sha` for the current full-stack deploy path.
- `.github/workflows/deploy-staging.yml` passes backend and frontend SHAs explicitly and reports them separately in the deployment summary.
- `.github/workflows/deploy-staging.yml` no longer deploys for docs-only runbook changes, and it does trigger for Firebase Hosting config/public-file changes.
- Path-aware deploys are still disabled. The workflow still deploys backend, frontend, and Hosting together until skipped-service smoke semantics are designed.

## Explicit Non-Goals For Now

- No Blacksmith CI migration.
- No same-SHA-passed-CI lookup machinery.
- No conditional migrations.
- No naive backend-only/frontend-only CI path split that drops cross-stack integration tests.
- No partial service deploys until release SHA skew is supported.
- No separate `ci-security.yml` unless it adds new checks such as CodeQL, dependency audit, or gitleaks.

## Exact Manual Work Required

These are the things the user must do or explicitly confirm before the agent can validate and proceed autonomously.

### A. GitHub Branch Protection

Manual UI path:

`GitHub repo -> Settings -> Branches -> Branch protection rules -> master`

Required settings:

- Require a pull request before merging.
- Require status checks to pass before merging.
- Required checks:
  - `Backend CI / test`
  - `Frontend CI / verify`
- Do not use deploy-call check names as required checks.

Manual verification:

- Open or use a test PR where one required check fails.
- Confirm GitHub blocks merge.
- Tell the agent: `Branch protection is verified`.

### B. GitHub Actions Variables

Manual UI path:

`GitHub repo -> Settings -> Secrets and variables -> Actions -> Variables`

Required current variables referenced by workflows:

```text
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
STAGING_LIVE_SESSION_ID
STAGING_CHAT_CONVERSATION_ID
STAGING_TOPIC_ID
STAGING_TOPIC_SEARCH_QUERY
```

New Sentry variables to add:

```text
SENTRY_ORG
SENTRY_PROJECT
NEXT_PUBLIC_SENTRY_DSN
```

Current wizard-generated Sentry values observed locally:

```text
SENTRY_ORG=kresco-jt
SENTRY_PROJECT=javascript-nextjs
```

Confirm these in the Sentry UI before storing them.

`NEXT_PUBLIC_SENTRY_DSN` is public app configuration, but it should still be managed as a GitHub Actions variable rather than hardcoded.

### C. GitHub Actions Secrets

Manual UI path:

`GitHub repo -> Settings -> Secrets and variables -> Actions -> Secrets`

Required current secrets referenced by workflows:

```text
STAGING_AUTH_SMOKE_EMAIL
STAGING_AUTH_SMOKE_PASSWORD
STAGING_AUTH_BASIC_EMAIL
STAGING_AUTH_BASIC_PASSWORD
STAGING_AUTH_STUDENT_EMAIL
STAGING_AUTH_STUDENT_PASSWORD
STAGING_AUTH_VIP_EMAIL
STAGING_AUTH_VIP_PASSWORD
STAGING_AUTH_ADMIN_EMAIL
STAGING_AUTH_ADMIN_PASSWORD
STAGING_AUTH_STAFF_EMAIL
STAGING_AUTH_STAFF_PASSWORD
STAGING_AUTH_PROFESSOR_EMAIL
STAGING_AUTH_PROFESSOR_PASSWORD
```

New Sentry secret to add:

```text
SENTRY_AUTH_TOKEN
```

Do not paste token values into chat.

Safe CLI option:

```powershell
gh secret set SENTRY_AUTH_TOKEN --repo Kresco-App/mvp-v2
```

The command will prompt for the token without putting it in shell history.

### D. GitHub Environments

Manual UI path:

`GitHub repo -> Settings -> Environments`

Required environment names used by workflows:

```text
staging
Production
```

Confirm:

- Both environments exist.
- Required deployment protection rules are intentional.
- Required variables/secrets are available at repo level or environment level.
- The agent is allowed to trigger staging workflows after code changes.

### E. Sentry

Manual work:

1. Rotate the pasted Sentry auth token.
2. Create a fresh token with these scopes:
   - `project:releases`
   - `org:read`
3. Store the fresh token as GitHub Actions secret:
   - `SENTRY_AUTH_TOKEN`
4. Store org/project/DSN as GitHub Actions variables:
   - `SENTRY_ORG`
   - `SENTRY_PROJECT`
   - `NEXT_PUBLIC_SENTRY_DSN`
5. Keep local `frontend/.env.sentry-build-plugin` ignored by git.

Local-only file:

```text
frontend/.env.sentry-build-plugin
```

Required local content shape:

```text
SENTRY_AUTH_TOKEN=<fresh-token>
```

Do not commit that file.

### F. GCP And Firebase Preconditions

The current workflows expect:

Projects:

```text
kresco-staging
kresco-prod
```

Region:

```text
europe-southwest1
```

Artifact Registry repository path:

```text
europe-southwest1-docker.pkg.dev/<project>/kresco-containers
```

Cloud Run services:

```text
kresco-backend-staging
kresco-frontend-staging
kresco-backend-prod
kresco-frontend-prod
```

Cloud SQL instances:

```text
kresco-staging-postgres
kresco-prod-postgres
```

Firebase Hosting sites:

```text
kresco-staging
kresco-staging-api
kresco-prod
kresco-prod-api
```

GCP Secret Manager secret expected by workflows:

```text
kresco-runtime
```

Required frontend build keys in `kresco-runtime`, with accepted aliases already used by the workflow:

```text
NEXT_PUBLIC_FIREBASE_API_KEY or FIREBASE_WEB_API_KEY
NEXT_PUBLIC_FIREBASE_PROJECT_ID or FIREBASE_PROJECT_ID or firebase_project_id
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN or FIREBASE_AUTH_DOMAIN or firebase_auth_domain
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET or FIREBASE_STORAGE_BUCKET or firebase_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID or FIREBASE_MESSAGING_SENDER_ID or firebase_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID or FIREBASE_APP_ID or firebase_app_id
NEXT_PUBLIC_FIRESTORE_DATABASE or FIRESTORE_DATABASE or firestore_database
```

Manual confirmation:

- The GitHub deploy service account can deploy Cloud Run services.
- The service account can push to Artifact Registry.
- The service account can access Secret Manager.
- The service account can patch Cloud SQL activation policy.
- The service account can deploy Firebase Hosting rewrites/sites.

### G. Policy Decisions To Confirm

The agent needs these decisions before implementing workflow changes:

1. Nightly Cloud SQL stop time.
   - Proposed: `23:30 UTC`.
   - Workflow should also allow manual dispatch.
2. Branch dispatch policy.
   - Proposed: keep allowed, but require deploy-embedded CI for non-master dispatch.
3. Rollback target.
   - Proposed: implement staging rollback first, then production rollback after validation.
4. Production promotion policy.
   - Proposed: production-dark deploys exact staging image digest, then production-live promotes traffic manually.

## What The Agent Can Validate After Manual Work

After the manual work above, the agent can validate without seeing secret values:

```powershell
gh secret list --repo Kresco-App/mvp-v2
gh variable list --repo Kresco-App/mvp-v2
gh workflow list --repo Kresco-App/mvp-v2
gh run list --repo Kresco-App/mvp-v2 --limit 20
```

The agent can also:

- Inspect branch protection if the GitHub token has sufficient permission.
- Run frontend lint/typecheck after code changes.
- Run backend/frontend focused tests after code changes.
- Trigger staging workflow dispatches if authorized.
- Watch workflow runs and inspect failures.
- Verify Sentry source-map upload indirectly through build logs and Sentry issue stack traces.
- Verify deployment timing before and after the pipeline changes.

The agent cannot validate the actual secret values without using them in a workflow run. Presence checks only prove names exist.

## Success Criteria

Phase 1 success:

- Staging deploy no longer stops Cloud SQL before staging smoke.
- Normal staging deploy time drops materially.
- Migrations still run every staging deploy.
- A separate manual/scheduled Cloud SQL stop workflow exists.

Phase 2 success:

- Protected `master` staging deploy skips embedded CI.
- Manual branch dispatch still runs embedded CI.
- Failed branch-dispatch CI blocks deploy.
- Cancelled CI blocks deploy.

Phase 3 success:

- Obsolete PR CI runs are cancelled on new commits.
- Current staging deploy concurrency remains safe.

Phase 4 success:

- Backend and frontend Docker builds use cache.
- Image digest outputs are preserved.
- No secrets are baked into image layers.

Phase 5 success:

- Sentry frontend is production-safe.
- Sentry backend is installed.
- Frontend source maps upload during Docker build through BuildKit secret.
- Sentry demo route is removed before staging/prod.

Phase 6 success:

- Manual Cloud Run rollback workflow exists.
- Rollback runbook includes expand/contract migration rule.

Phase 7 success:

- Production-dark deploys exact staging-verified image digests.
- Production-live traffic promotion happens after verification.

## References

- GitHub Actions billing and standard hosted runner behavior: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- GitHub Actions runner pricing: https://docs.github.com/en/billing/reference/actions-runner-pricing
- Sentry Next.js source map auth token scopes: https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/troubleshooting_js/legacy-uploading-methods/
