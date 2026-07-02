# Production Runbook

## Release Preflight

1. Confirm the target GitHub Environment selects the correct GCP project: `kresco-staging` or `kresco-prod`.
2. Confirm backend runtime secrets are available through `KRESCO_GCP_RUNTIME_SECRET_NAME=projects/$PROJECT_ID/secrets/kresco-runtime/versions/latest`.
3. Confirm `DATABASE_URL` points at managed Postgres, includes `sslmode=verify-full`, and uses `PGSSLROOTCERT=certifi`.
4. Confirm `DATABASE_CONNECTION_STRATEGY=cloud_sql` or `DATABASE_CONNECTION_STRATEGY=alloydb`.
5. Confirm `MEDIA_STORAGE_BACKEND=gcs`, `MEDIA_GCS_BUCKET`, `MEDIA_GCS_PREFIX`, quota settings, and lifecycle retention are configured.
6. Confirm Firebase Auth and Firestore values match the same project as the deployed frontend.
7. Confirm frontend domains are attached before user cutover: `kresco.ma`, `www.kresco.ma`, `app.kresco.ma`, `admin.kresco.ma`, `prof.kresco.ma`, and `staff.kresco.ma`.
8. Confirm Firebase Auth authorized domains include every production frontend domain and the Firebase default domains.
9. Confirm Firebase Auth sign-in providers are launch-ready:
   - Email/Password is enabled in `kresco-prod`.
   - Google is enabled in `kresco-prod` with a production Google Web Client ID and Web Secret. If Google is missing, create or select a production OAuth web client in Google Auth Platform/Credentials, add the Firebase Auth redirect handler for `kresco-prod`, then enable the Google provider in Firebase Auth.
   - Phone is enabled in `kresco-prod` before any SMS verification UI is exposed.

```powershell
$env:FIREBASE_GOOGLE_CLIENT_ID="<production-web-client-id>"
$env:FIREBASE_GOOGLE_CLIENT_SECRET="<production-web-client-secret>"
python scripts/configure_firebase_google_provider.py --project-id kresco-prod --json
Remove-Item Env:\FIREBASE_GOOGLE_CLIENT_ID,Env:\FIREBASE_GOOGLE_CLIENT_SECRET
```

10. Confirm the backend runtime domain contract passes before deploy:

```powershell
python scripts/check_public_auth_readiness.py --project-id kresco-prod --runtime-secret-name kresco-runtime --frontend-apex-url https://kresco.ma --api-host api.kresco.ma --runtime-secret-only
```

## Domain Routing

One frontend deployment serves all browser workspaces. `proxy.ts` routes by host:

- `kresco.ma` is the public landing and auth entry.
- `www.kresco.ma` redirects to `kresco.ma`.
- `app.kresco.ma` opens the student app at `/home`.
- `admin.kresco.ma` opens the founder/admin workspace at `/admin`.
- `prof.kresco.ma` opens the professor workspace at `/professor`.
- `staff.kresco.ma` opens the WhatsApp/payment staff workspace at `/staff/payments`.

Keep authorization inside backend routes and server/client guards. Host routing is only a UX boundary; it is not the permission boundary.

`prof.kresco.ma` is the canonical professor origin. If a wildcard DNS record ever makes `professor.kresco.ma` resolve, the frontend proxy redirects it back to `prof.kresco.ma`; do not add `professor.kresco.ma` as a separate Firebase Auth, CORS, or CSRF origin.

Production backend env:

```text
FRONTEND_URL=https://kresco.ma
CORS_ALLOWED_ORIGINS=https://kresco.ma,https://www.kresco.ma,https://app.kresco.ma,https://admin.kresco.ma,https://prof.kresco.ma,https://staff.kresco.ma
CSRF_TRUSTED_ORIGINS=https://kresco.ma,https://www.kresco.ma,https://app.kresco.ma,https://admin.kresco.ma,https://prof.kresco.ma,https://staff.kresco.ma
KRESCO_TRUSTED_HOSTS=api.kresco.ma
AUTH_COOKIE_DOMAIN=kresco.ma
AUTH_COOKIE_SAMESITE=lax
```

Production frontend env:

```text
NEXT_PUBLIC_SITE_URL=https://kresco.ma
NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=kresco.ma
NEXT_PUBLIC_API_BASE_URL=/api/
KRESCO_BACKEND_ORIGIN=https://api.kresco.ma
KRESCO_HSTS_INCLUDE_SUBDOMAINS=false
```

DNS:

- Attach `kresco.ma`, `www`, `app`, `admin`, `prof`, and `staff` to the production frontend Firebase Hosting site.
- Attach `api.kresco.ma` to the production API Firebase Hosting site.
- Keep `KRESCO_HSTS_INCLUDE_SUBDOMAINS=false` until every listed subdomain has working HTTPS and production routing smoke passes. After cutover, redeploy the frontend with `hsts_include_subdomains=true` deliberately.

Firebase currently requests these DNS records for production custom-domain activation:

| Host | Type | Value |
| --- | --- | --- |
| `kresco.ma` | A | `199.36.158.100` |
| `kresco.ma` | TXT | `hosting-site=kresco-prod` |
| `www.kresco.ma` | CNAME | `kresco-prod.web.app` |
| `app.kresco.ma` | CNAME | `kresco-prod.web.app` |
| `admin.kresco.ma` | CNAME | `kresco-prod.web.app` |
| `prof.kresco.ma` | CNAME | `kresco-prod.web.app` |
| `staff.kresco.ma` | CNAME | `kresco-prod.web.app` |
| `api.kresco.ma` | CNAME | `kresco-prod-api.web.app` |

To print DNS-panel friendly names for the `kresco.ma` zone without calling Firebase:

```powershell
python scripts/render_required_dns_records.py --environment production
python scripts/render_required_dns_records.py --environment production --format csv
python scripts/render_required_dns_records.py --environment production --format bind
```

Firebase Hosting edge:

1. Run the manual `Deploy Firebase Hosting Edge` workflow for production with `confirm_production_hosting_deploy=true`. Set `ensure_custom_domains=true` only when you intentionally want the workflow to create missing Firebase Hosting custom-domain resources.
2. Confirm the workflow creates or verifies the frontend/API Firebase Hosting sites before deploy.
3. Confirm the frontend and API custom domains are attached to the correct Firebase Hosting sites.
4. Run the manual `Production Public Domain Evidence` workflow with `confirm_production_public_domain_check=true`, the expected frontend/backend short SHA, and the intended HSTS policy. Its artifact must include passing `firebase-hosting-rewrites.json`, `firebase-hosting-domains.json`, and `public-api-health.json` proving the site/domain contract, `https://api.kresco.ma/ready`, and the backend release SHA on `https://api.kresco.ma/health`.
5. Only then run the public routing smoke below if you need a local repeat.

## Deploy

1. Confirm the latest `Deploy Staging` workflow on `master` passed first.
2. Run the backend deploy workflow with production-dark confirmation enabled.
3. Let the workflow preflight the runtime domain contract, build the backend image, push it to Artifact Registry, deploy the Cloud Run service, execute the migration job, and verify `/ready`.
4. Run the frontend deploy workflow after the backend URL is known.
5. Verify public production routing after DNS is attached:

```powershell
python scripts/check_subdomain_routing.py --apex-url https://kresco.ma --expected-sha <short-sha> --hsts-policy no-include-subdomains --required
python scripts/check_public_auth_readiness.py --project-id kresco-prod --runtime-secret-name kresco-runtime --frontend-apex-url https://kresco.ma --api-host api.kresco.ma --require-email-password --require-google-provider --require-phone-provider
python scripts/ensure_firebase_hosting_sites.py --environment production --json
python scripts/ensure_firebase_hosting_sites.py --environment production --ensure --json
python scripts/ensure_firebase_hosting_domains.py --environment production --json
python scripts/ensure_firebase_hosting_domains.py --environment production --ensure --json
python scripts/export_firebase_hosting_dns_records.py --environment production --json
python scripts/check_firebase_hosting_public_dns.py --environment production --json
python scripts/check_firebase_hosting_rewrites.py --environment production --json
python scripts/check_firebase_hosting_domains.py --environment production --json
python scripts/check_firebase_hosting_domains.py --environment production --live --json
```

This checks the apex release marker, `www` canonical redirect, app/admin/staff unauthenticated redirect boundaries, the professor login boundary, backend auth-domain settings, Firebase Auth authorized domains, and Email/Password, Google, and Phone provider enablement.
The `Production Public Domain Evidence` workflow also checks the Hosting site/domain split, live Firebase custom-domain attachments, and the public API domain directly. It fails unless `firebase-hosting-domains.json` includes and live-discovers every expected public host, and `public-api-health.json` proves `api.kresco.ma` is serving the same backend release.
For production, prefer verification first. If the project target has been double-checked and only Firebase Auth authorized domains are missing, rerun the auth command with `--ensure-authorized-domains` to add the required production frontend domains without removing existing Firebase defaults.

6. Do not route real users during dark production.
7. After every frontend subdomain is live on HTTPS and the `Production Public Domain Evidence` workflow passes with `hsts_policy=no-include-subdomains`, rerun the frontend deploy with `hsts_include_subdomains=true` and `enforce_production_launch_gate=true`.
8. Rerun `Production Public Domain Evidence` with `hsts_policy=include-subdomains`.
9. Capture `/ready` and protected `/api/internal/diagnostics` output as launch evidence.

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
