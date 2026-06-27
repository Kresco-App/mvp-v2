# Staging Deployment Automation

Staging is now designed as the first release target. Pull requests run tests only. Pushes to `master` run tests, deploy backend, run migrations, deploy frontend, then run staging smoke checks.

## Automated Flow

Workflow: `.github/workflows/deploy-staging.yml`

1. Backend CI runs `ci-backend.yml`.
2. Frontend CI runs `ci-frontend.yml`.
3. Backend deploy runs `deploy-backend.yml` as a reusable workflow.
4. Backend deploy updates the runtime release secret, then preflights the runtime domain contract before building an image.
5. Backend image is built and pushed to Artifact Registry.
6. Backend Cloud Run is deployed with the latest image.
7. Migration job is updated to the same image.
8. Cloud SQL is started, Alembic runs, backend readiness is checked, then Cloud SQL is stopped again.
9. Frontend deploy runs `deploy-frontend.yml` as a reusable workflow.
10. Frontend image is built with Firebase public config from Secret Manager.
11. Frontend Cloud Run is deployed and smoke checked.
12. Firebase Hosting site creation is checked through the REST API, creating the frontend/API Hosting sites if missing.
13. Firebase Hosting custom-domain resources are checked through the REST API, creating missing staging domain resources if needed.
14. Firebase Hosting deploys the staging edge rewrites from `firebase.json`.
15. `scripts/check_public_auth_readiness.py` verifies the public auth/domain contract and idempotently adds missing Firebase Auth authorized domains.
16. `scripts/check_staging_deployment.py` verifies backend readiness, public API readiness, release SHA, frontend release marker, public staging subdomain routing, removed local auth routes, and optional Firebase credential login.

The staging workflow publishes service URLs, revision names, image references, image digests when returned by Artifact Registry, and commit SHA to the GitHub step summary.

## Staging Domains

Use the same routing model as production, under the staging apex:

- `staging.kresco.ma` is the staging landing/auth entry.
- `www.staging.kresco.ma` redirects to `staging.kresco.ma`.
- `app.staging.kresco.ma` opens `/home`.
- `admin.staging.kresco.ma` opens `/admin`.
- `prof.staging.kresco.ma` opens `/professor`.
- `staff.staging.kresco.ma` opens `/staff/payments`.

`prof.staging.kresco.ma` is the only configured professor origin. If `professor.staging.kresco.ma` ever resolves through a wildcard DNS record, the frontend proxy canonicalizes it back to `prof.staging.kresco.ma`; do not add the alias to Firebase Auth, CORS, or CSRF allowlists.

Staging backend env:

```text
FRONTEND_URL=https://staging.kresco.ma
CORS_ALLOWED_ORIGINS=https://staging.kresco.ma,https://www.staging.kresco.ma,https://app.staging.kresco.ma,https://admin.staging.kresco.ma,https://prof.staging.kresco.ma,https://staff.staging.kresco.ma
CSRF_TRUSTED_ORIGINS=https://staging.kresco.ma,https://www.staging.kresco.ma,https://app.staging.kresco.ma,https://admin.staging.kresco.ma,https://prof.staging.kresco.ma,https://staff.staging.kresco.ma
KRESCO_TRUSTED_HOSTS=api.staging.kresco.ma
AUTH_COOKIE_DOMAIN=staging.kresco.ma
AUTH_COOKIE_SAMESITE=lax
```

Staging frontend env:

```text
NEXT_PUBLIC_SITE_URL=https://staging.kresco.ma
NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=staging.kresco.ma
NEXT_PUBLIC_API_BASE_URL=/api/
KRESCO_BACKEND_ORIGIN=https://api.staging.kresco.ma
```

Firebase Auth authorized domains must include the six staging frontend hosts above plus the Firebase default domains. The staging workflow union-patches missing staging frontend hosts with `--ensure-authorized-domains`, preserving existing Firebase defaults such as `localhost` and `*.firebaseapp.com`. Google OAuth redirect/origin settings must also include the staging hosts that can launch sign-in.

The staging smoke job checks `https://staging.kresco.ma` and `https://api.staging.kresco.ma` directly after each `master` deploy. It proves the apex serves the expected release marker, `www.staging.kresco.ma` canonicalizes to the apex, unauthenticated app/admin/staff hosts return to the apex without redirect loops, the professor host opens the professor login boundary, the public API host reports the expected backend release, and HSTS does not include `includeSubDomains` before public cutover.

Before the backend image build, staging runs `scripts/check_public_auth_readiness.py --runtime-secret-only` so a mismatched `FRONTEND_URL`, CORS, CSRF, trusted-host, or cookie-domain setting fails early with a direct error. Before Cloud SQL is started for smoke checks, staging runs the full `scripts/check_public_auth_readiness.py`. That fixes missing Firebase Auth authorized domains, then fails the deploy if the runtime secret does not match the public domain model, Firebase Auth still misses any required staging authorized domain, or Email/Password/Google sign-in is disabled.

Cloud Run custom-domain mappings are not used for staging because `europe-southwest1` is not a supported Cloud Run domain-mapping region. Firebase Hosting is the edge layer:

- `staging-frontend` rewrites `/api/**` and `/media/**` to `kresco-backend-staging`, then rewrites everything else to `kresco-frontend-staging`.
- `staging-api` rewrites every path to `kresco-backend-staging`.
- Attach `staging.kresco.ma`, `www.staging.kresco.ma`, `app.staging.kresco.ma`, `admin.staging.kresco.ma`, `prof.staging.kresco.ma`, and `staff.staging.kresco.ma` to the frontend Hosting site.
- Attach `api.staging.kresco.ma` to the API Hosting site.

Firebase currently requests these DNS records for staging custom-domain activation:

| Host | Type | Value |
| --- | --- | --- |
| `staging.kresco.ma` | CNAME | `kresco-staging.web.app` |
| `www.staging.kresco.ma` | CNAME | `kresco-staging.web.app` |
| `app.staging.kresco.ma` | CNAME | `kresco-staging.web.app` |
| `admin.staging.kresco.ma` | CNAME | `kresco-staging.web.app` |
| `prof.staging.kresco.ma` | CNAME | `kresco-staging.web.app` |
| `staff.staging.kresco.ma` | CNAME | `kresco-staging.web.app` |
| `api.staging.kresco.ma` | CNAME | `kresco-staging-api.web.app` |

To print DNS-panel friendly names for the `kresco.ma` zone without calling Firebase:

```powershell
python scripts/render_required_dns_records.py --environment staging
python scripts/render_required_dns_records.py --environment staging --format csv
python scripts/render_required_dns_records.py --environment staging --format bind
```

Equivalent local command:

```powershell
python scripts/ensure_firebase_hosting_sites.py --environment staging --json
python scripts/ensure_firebase_hosting_sites.py --environment staging --ensure --json
python scripts/ensure_firebase_hosting_domains.py --environment staging --json
python scripts/ensure_firebase_hosting_domains.py --environment staging --ensure --json
python scripts/export_firebase_hosting_dns_records.py --environment staging --json
python scripts/check_firebase_hosting_public_dns.py --environment staging --json
python scripts/check_firebase_hosting_rewrites.py --environment staging --json
python scripts/check_firebase_hosting_domains.py --environment staging --json
python scripts/check_firebase_hosting_domains.py --environment staging --live --json
```

The `Staging Launch Evidence` workflow captures `firebase-hosting-rewrites.json` and a live `firebase-hosting-domains.json`, runs public subdomain routing smoke against `https://staging.kresco.ma`, and writes `public-api-health.json` from `https://api.staging.kresco.ma/ready` and `https://api.staging.kresco.ma/health`. Launch evidence fails if the Hosting rewrite contract drifts, the expected frontend/API site split changes, Firebase Hosting cannot list live custom domains, any staging frontend/API host is not attached, serves the wrong release, or responds with the wrong workspace redirect boundary.
Its public-auth check is verify-only too: it does not pass `--ensure-authorized-domains`, so launch evidence proves Firebase Auth and runtime secrets are already correct after staging deploy smoke.

## Local Subdomain Mirror

Use `kresco.test` locally when you want the closest production-shaped mirror. Add these hosts-file entries:

```text
127.0.0.1 kresco.test
127.0.0.1 www.kresco.test
127.0.0.1 app.kresco.test
127.0.0.1 admin.kresco.test
127.0.0.1 prof.kresco.test
127.0.0.1 professor.kresco.test
127.0.0.1 staff.kresco.test
127.0.0.1 api.kresco.test
```

Then use:

- `http://kresco.test:3000`
- `http://app.kresco.test:3000`
- `http://admin.kresco.test:3000`
- `http://prof.kresco.test:3000`
- `http://staff.kresco.test:3000`

If you do not want to edit the hosts file, use `lvh.me` instead because it resolves to `127.0.0.1` automatically:

- `http://kresco.lvh.me:3000`
- `http://app.kresco.lvh.me:3000`
- `http://admin.kresco.lvh.me:3000`
- `http://prof.kresco.lvh.me:3000`
- `http://staff.kresco.lvh.me:3000`

Run one frontend dev server. The proxy reads the host and rewrites to the right workspace. Frontend local env should keep browser API calls same-origin with `NEXT_PUBLIC_API_BASE_URL=/api/` and send those rewrites to `KRESCO_LOCAL_BACKEND_ORIGIN=http://127.0.0.1:8000`. Local backend env should include those exact origins in `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`. Use `AUTH_COOKIE_DOMAIN=kresco.test` for the hosts-file mirror or `AUTH_COOKIE_DOMAIN=kresco.lvh.me` for the no-hosts-file mirror, so auth cookies can be shared across local subdomains.

Use `http://prof.kresco.test:3000` or `http://prof.kresco.lvh.me:3000` locally for professor work. `professor.*` is only an alias redirect and should not be added to backend auth origin lists.

After the frontend dev server is running, verify the local mirror with:

```powershell
cd frontend
npm run check:local-subdomains
npm run check:local-subdomains:kresco-test
```

or from the repo root:

```powershell
python scripts/check_subdomain_routing.py --apex-url http://kresco.lvh.me:3000 --hsts-policy ignore --check-professor-alias --required
python scripts/check_subdomain_routing.py --apex-url http://kresco.test:3000 --hsts-policy ignore --check-professor-alias --required
```

That local check proves the apex host serves HTML, `www` redirects to the apex, app/admin/staff unauthenticated roots return to the landing host, `prof` opens the professor login boundary, and the optional `professor` alias redirects to `prof`.

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

Additional staging evidence workflows use the same Cloud SQL concurrency group as staging deploys, so SQL-backed probes do not race each other while the instance is starting or stopping.

Required for topic latency evidence:

- `STAGING_TOPIC_ID` GitHub Environment var.
- `STAGING_TOPIC_SEARCH_QUERY` GitHub Environment var.
- `STAGING_AUTH_SMOKE_EMAIL` and `STAGING_AUTH_SMOKE_PASSWORD` GitHub Environment secrets for a Firebase staging student with access to that topic. The workflow mints a fresh Firebase ID token at runtime; do not store expiring ID tokens as secrets.

Required for live/chat load evidence:

- `STAGING_AUTH_SMOKE_EMAIL` and `STAGING_AUTH_SMOKE_PASSWORD` GitHub Environment secrets for a Firebase staging student with live/chat access.
- Optional `STAGING_LIVE_SESSION_ID` and `STAGING_CHAT_CONVERSATION_ID` GitHub Environment vars. If absent, the checker discovers IDs from the student's accessible lists.

## Verified Staging Access

These were verified from the workstation on 2026-06-18:

- GitHub CLI is authenticated and can access `Kresco-App/mvp-v2`.
- Staging GitHub Environment contains the GCP OIDC var names.
- `github-deployer@kresco-staging.iam.gserviceaccount.com` can be impersonated.
- The deploy service account can read `gs://kresco-staging-private-media` bucket posture.
- The deploy service account has `roles/datastore.user` for the Firestore realtime evidence probe.
- The deploy service account has `roles/firebaseauth.admin` for Firebase Auth user/config verification automation.
- Identity Toolkit API is enabled.
- Firebase Email/Password and Google providers are enabled.
- Firebase authorized domains include localhost, Firebase default domains, `staging.kresco.ma`, `www.staging.kresco.ma`, `app.staging.kresco.ma`, `admin.staging.kresco.ma`, `prof.staging.kresco.ma`, and `staff.staging.kresco.ma`.
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
8. `scripts/check_public_auth_readiness.py` passes for runtime secret domain values, Firebase Auth authorized domains, and Email/Password/Google provider enablement after its idempotent staging authorized-domain update.
9. `firebase-hosting-rewrites.json` proves the frontend Hosting target routes app traffic to the frontend service and API/media traffic to the backend service, while the API Hosting target routes every path to the backend service.
10. `firebase-hosting-domains.json` proves the frontend/API Hosting target split and live Firebase custom-domain attachment for every expected staging public hostname.
11. `www.staging.kresco.ma` redirects to `staging.kresco.ma`, workspace roots rewrite correctly, and unauthenticated workspace hosts redirect to `staging.kresco.ma` instead of looping.
12. Cloud SQL is back to `STOPPED` with `activationPolicy=NEVER` after migrations.
13. Media bucket evidence can read bucket posture and IAM posture.
14. Firestore realtime fanout evidence can write, read, and delete a synthetic staging probe document.
15. Terraform `fmt` and `validate` pass for the scaffold.
16. CMI/VdoCipher/production rows remain explicitly pending until real provider evidence exists.
