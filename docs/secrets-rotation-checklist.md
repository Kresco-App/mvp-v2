# Secrets Rotation Checklist

Do not record secret values in this file. Record only provider, secret name, owner, timestamp, and evidence links.

## Required Before Production Unfreeze

1. Inventory every deployed secret in GitHub Environments, Google Secret Manager, Firebase, CMI, Resend, VdoCipher, Upstash, and the managed Postgres provider.
2. Rotate any credential that was ever present in a local ignored `.env`, shell history, chat transcript, screenshot, or pasted debugging output.
3. Revoke the old value after the new value is installed and staging diagnostics pass.
4. Confirm backend runtime secrets are stored in Google Secret Manager JSON and only referenced by `KRESCO_GCP_RUNTIME_SECRET_NAME`.
5. Confirm frontend public runtime config is sourced from the Cloud Run deploy workflow and Firebase project values, not checked-in production `.env` files.
6. Run `python scripts/check_secret_hygiene.py` in CI and `python scripts/check_secret_hygiene.py --include-local-env` on release workstations.
7. Attach staging runtime verifier output and provider-side rotation evidence to the launch gate.

## Rotation Record Template

| Secret Name | Provider | Environment | Owner | Rotated At UTC | Old Value Revoked | Evidence Link |
| --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | GitHub Environment / Google Cloud SQL | staging | TBD | TBD | TBD | TBD |
| `DATABASE_URL` | GitHub Environment / Google Cloud SQL | production | TBD | TBD | TBD | TBD |
| `JWT_SECRET_KEY` | Google Secret Manager | staging | TBD | TBD | TBD | TBD |
| `JWT_SECRET_KEY` | Google Secret Manager | production | TBD | TBD | TBD | TBD |
| `REALTIME_OUTBOX_SECRET` | Google Secret Manager | staging | TBD | TBD | TBD | TBD |
| `REALTIME_OUTBOX_SECRET` | Google Secret Manager | production | TBD | TBD | TBD | TBD |
| `KRESCO_RATE_LIMIT_STORAGE_URI` | Google Secret Manager / Redis provider | staging | TBD | TBD | TBD | TBD |
| `KRESCO_RATE_LIMIT_STORAGE_URI` | Google Secret Manager / Redis provider | production | TBD | TBD | TBD | TBD |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_DEPLOY_SERVICE_ACCOUNT` | GitHub Environment / Google IAM | deploy | TBD | TBD | TBD | TBD |
| `MEDIA_GCS_BUCKET` policy and lifecycle | Google Cloud Storage | staging | TBD | TBD | TBD | TBD |
| `MEDIA_GCS_BUCKET` policy and lifecycle | Google Cloud Storage | production | TBD | TBD | TBD | TBD |
| `RESEND_API_KEY` | Google Secret Manager / Resend | staging | TBD | TBD | TBD | TBD |
| `RESEND_API_KEY` | Google Secret Manager / Resend | production | TBD | TBD | TBD | TBD |
| `FIREBASE_WEB_API_KEY` | Firebase / Google Secret Manager | staging | TBD | TBD | TBD | TBD |
| `FIREBASE_WEB_API_KEY` | Firebase / Google Secret Manager | production | TBD | TBD | TBD | TBD |
| `VDOCIPHER_API_SECRET` / `VDOCIPHER_LIVE_CREATE_URL` | Google Secret Manager / VdoCipher | staging | TBD | TBD | TBD | TBD |
| `VDOCIPHER_API_SECRET` / `VDOCIPHER_LIVE_CREATE_URL` | Google Secret Manager / VdoCipher | production | TBD | TBD | TBD | TBD |

## Evidence Rules

- Evidence may link to provider audit logs, ticket IDs, deployment run IDs, or screenshots stored outside the repo.
- Evidence must prove the old value was revoked or disabled, not only that a new value exists.
- Release sign-off must not mark `SEC-SECRETS-001` verified while any row still has `TBD`.
