# Manual Operations

## Runtime Shape

Kresco production and staging run on Cloud Run with managed Postgres, Firebase Auth, Firestore realtime, Google Secret Manager, and private Cloud Storage media. This branch does not maintain an alternate deployment path.

## Cost Controls

- Keep Cloud Run `--min-instances 0` before launch unless actively load testing.
- Stop dark-production and staging Cloud SQL instances when not testing.
- Use zonal Cloud SQL for dark production unless a high-availability rehearsal is explicitly scheduled.
- Keep Artifact Registry cleanup enabled and retain only a small number of recent images.
- Prune disabled Secret Manager versions after rotation evidence is captured.
- Add Upstash Redis only when live-like rate-limit/load testing needs a shared store.

## Media Posture

- Use `MEDIA_STORAGE_BACKEND=gcs`.
- Store durable references as `gs://bucket/prefix/object`.
- Return only short-lived signed read URLs to clients.
- Keep buckets private, deny anonymous object reads, and enable lifecycle cleanup for staging and production prefixes.
- Grant the GitHub deploy service account enough read-only bucket posture access for evidence collection: `storage.buckets.get` and `storage.buckets.getIamPolicy` on the staging and production media buckets.

## Deploy Evidence

Use `docs/production-runbook.md` for the release sequence. Before routing users, attach:

- Backend and frontend deploy workflow run links.
- `/ready` output.
- Protected `/api/internal/diagnostics` output.
- Cloud Storage bucket policy/lifecycle proof.
- Managed Postgres backup and restore drill proof.
- Realtime outbox and Firestore delivery proof.
- Payment, email, video, media upload, and auth smoke-test evidence.

## Diagnostics

`/ready` is the release health gate. `/api/internal/diagnostics` requires `x-kresco-internal-secret` and reports database, migration, storage, realtime, video, email, and payment status without returning secret values.
