# Staging Deployment Automation

Staging is now designed as the first release target. Pull requests run tests only. Pushes to `master` run tests, deploy backend, run migrations, deploy frontend, then run staging smoke checks.

## Automated Flow

Workflow: `.github/workflows/deploy-staging.yml`

1. Backend CI runs `ci-backend.yml`.
2. Frontend CI runs `ci-frontend.yml`.
3. Backend deploy runs `deploy-backend.yml` as a reusable workflow.
4. Backend image is built and pushed to Artifact Registry.
5. Backend Cloud Run is deployed with the latest image.
6. Migration job is updated to the same image.
7. Cloud SQL is started, Alembic runs, backend readiness is checked, then Cloud SQL is stopped again.
8. Frontend deploy runs `deploy-frontend.yml` as a reusable workflow.
9. Frontend image is built with Firebase public config from Secret Manager.
10. Frontend Cloud Run is deployed and smoke checked.
11. `scripts/check_staging_deployment.py` verifies backend readiness, release SHA, frontend release marker, removed local auth routes, and optional Firebase credential login.

The staging workflow publishes service URLs, revision names, image references, image digests when returned by Artifact Registry, and commit SHA to the GitHub step summary.

## Production Boundary

Production deploy workflows remain manual through `workflow_dispatch`. They still require:

- `confirm_production_dark_deploy=true`
- production GitHub Environment protection,
- launch gate checks before real cutover,
- no domain or user traffic cutover without explicit approval.

The staging auto-deploy workflow does not target production.

## GitHub Environment Requirements

Environment: `staging`

Required vars:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`: staging GitHub workload identity provider resource name.
- `GCP_DEPLOY_SERVICE_ACCOUNT`: staging deploy service account email.

Optional secrets for full auth smoke:

```text
STAGING_AUTH_SMOKE_EMAIL=<Firebase test user email>
STAGING_AUTH_SMOKE_PASSWORD=<Firebase test user password>
```

If the auth smoke secrets are absent, the workflow still checks the deployed Firebase session boundary by proving the retired local password routes are gone.

## Verified Staging Access

These were verified from the workstation on 2026-06-18:

- GitHub CLI is authenticated and can access `Kresco-App/mvp-v2`.
- Staging GitHub Environment contains the GCP OIDC var names.
- `github-deployer@kresco-staging.iam.gserviceaccount.com` can be impersonated.
- The deploy service account can read `gs://kresco-staging-private-media` bucket posture.
- Identity Toolkit API is enabled.
- Firebase Email/Password and Google providers are enabled.
- Firebase authorized domains include localhost, Firebase default domains, the staging Cloud Run frontend URL, and `staging.kresco.ma`.
- Docker is running locally.
- Terraform is installed under the user PATH for future terminals; the current Codex process can use the absolute binary path if needed.

## Runtime Notes

`NEXT_PUBLIC_REALTIME_PROVIDER=firestore` is a public frontend build setting. It tells the frontend to use the Firestore realtime implementation instead of the disabled/local provider. It is not a secret.

The runtime secret still has intentionally pending provider values:

- CMI values are pending until payment provider credentials and callback URLs are ready.
- VdoCipher live values are pending until provider live-stream credentials are ready.
- `KRESCO_RATE_LIMIT_STORAGE_URI` remains pending until a shared rate-limit store is selected.

Do not mark `SEC-SECRETS-001`, full provider diagnostics, or production sign-off complete while those rows are pending.

## Terraform

Terraform lives under `infra/terraform`.

Current policy:

1. Use the staging scaffold as import-first documentation.
2. Do not apply over existing live resources before running the import plan.
3. Review `terraform plan` before any apply.
4. Keep production scaffold unapplied until explicit production infrastructure approval.

Run from `infra/terraform/envs/staging`:

```powershell
terraform init -backend=false
terraform validate
terraform fmt -recursive
```

If Terraform is not visible in the current shell, use the installed binary path:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Hashicorp.Terraform_Microsoft.Winget.Source_8wekyb3d8bbwe\terraform.exe" validate
```

## Complete And Tested Checklist

Mark staging automation complete only after all of this is true:

1. The commit containing `.github/workflows/deploy-staging.yml` is on `master`.
2. The `Deploy Staging` workflow passes on `master`.
3. The workflow summary shows backend URL, frontend URL, both revision names, image references, and commit SHA.
4. `/ready` and `/health` pass for the deployed backend revision.
5. The frontend root returns HTML with the expected `data-release` marker.
6. Old backend local auth routes return 404 or 405.
7. If `STAGING_AUTH_SMOKE_EMAIL/PASSWORD` are configured, Firebase password sign-in and `/api/auth/firebase-session` both pass.
8. Cloud SQL is back to `STOPPED` with `activationPolicy=NEVER` after migrations.
9. Media bucket evidence can read bucket posture and IAM posture.
10. Terraform `fmt` and `validate` pass for the scaffold.
11. CMI/VdoCipher/production rows remain explicitly pending until real provider evidence exists.
