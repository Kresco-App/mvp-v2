# Secrets Rotation Checklist

Do not record secret values in this file. Record only provider, secret name, owner, timestamp, and evidence links.

## Required Before Production Unfreeze

1. Inventory every deployed secret in GitHub Environments, Vercel, AWS, Stripe, Resend, Ably, Google, VdoCipher, and RDS.
2. Rotate any credential that was ever present in a local ignored `.env`, shell history, chat transcript, screenshot, or pasted debugging output.
3. Revoke the old value after the new value is installed and staging diagnostics pass.
4. Confirm backend deploys source runtime secrets from GitHub Environment secrets or variables, not checked-in files.
5. Confirm frontend deploys source public runtime config from Vercel environment values, not checked-in production `.env` files.
6. Run `python scripts/check_secret_hygiene.py` in CI and `python scripts/check_secret_hygiene.py --include-local-env` on release workstations.
7. Attach staging runtime verifier output and provider-side rotation evidence to the launch gate.

## Rotation Record Template

| Secret Name | Provider | Environment | Owner | Rotated At UTC | Old Value Revoked | Evidence Link |
| --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | GitHub Environment / AWS RDS Proxy | staging | TBD | TBD | TBD | TBD |
| `DATABASE_URL` | GitHub Environment / AWS RDS Proxy | production | TBD | TBD | TBD | TBD |
| `JWT_SECRET_KEY` | GitHub Environment | staging | TBD | TBD | TBD | TBD |
| `JWT_SECRET_KEY` | GitHub Environment | production | TBD | TBD | TBD | TBD |
| `REALTIME_OUTBOX_SECRET` | GitHub Environment | staging | TBD | TBD | TBD | TBD |
| `REALTIME_OUTBOX_SECRET` | GitHub Environment | production | TBD | TBD | TBD | TBD |
| `KRESCO_RATE_LIMIT_STORAGE_URI` | GitHub Environment / Redis provider | staging | TBD | TBD | TBD | TBD |
| `KRESCO_RATE_LIMIT_STORAGE_URI` | GitHub Environment / Redis provider | production | TBD | TBD | TBD | TBD |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | GitHub Environment / AWS IAM | deploy | TBD | TBD | TBD | TBD |
| `MEDIA_S3_BUCKET` policy and lifecycle | AWS S3 | staging | TBD | TBD | TBD | TBD |
| `MEDIA_S3_BUCKET` policy and lifecycle | AWS S3 | production | TBD | TBD | TBD | TBD |
| `STRIPE_SK` / `STRIPE_WEBHOOK_SECRET` | GitHub Environment / Stripe | staging | TBD | TBD | TBD | TBD |
| `STRIPE_SK` / `STRIPE_WEBHOOK_SECRET` | GitHub Environment / Stripe | production | TBD | TBD | TBD | TBD |
| `RESEND_API_KEY` | GitHub Environment / Resend | staging | TBD | TBD | TBD | TBD |
| `RESEND_API_KEY` | GitHub Environment / Resend | production | TBD | TBD | TBD | TBD |
| `ABLY_API_KEY` | GitHub Environment / Ably | staging | TBD | TBD | TBD | TBD |
| `ABLY_API_KEY` | GitHub Environment / Ably | production | TBD | TBD | TBD | TBD |
| `GOOGLE_CLIENT_ID` | GitHub/Vercel Environment / Google OAuth | staging | TBD | TBD | TBD | TBD |
| `GOOGLE_CLIENT_ID` | GitHub/Vercel Environment / Google OAuth | production | TBD | TBD | TBD | TBD |
| `VDOCIPHER_API_SECRET` / `VDOCIPHER_LIVE_CREATE_URL` | GitHub Environment / VdoCipher | staging | TBD | TBD | TBD | TBD |
| `VDOCIPHER_API_SECRET` / `VDOCIPHER_LIVE_CREATE_URL` | GitHub Environment / VdoCipher | production | TBD | TBD | TBD | TBD |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | GitHub Environment / Vercel | deploy | TBD | TBD | TBD | TBD |

## Evidence Rules

- Evidence may link to provider audit logs, ticket IDs, deployment run IDs, or screenshots stored outside the repo.
- Evidence must prove the old value was revoked or disabled, not only that a new value exists.
- Release sign-off must not mark `SEC-SECRETS-001` verified while any row still has `TBD`.
