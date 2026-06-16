# GCP/Firebase Migration Branch

This branch intentionally targets a breaking replatform. `master` remains the rollback path for the current AWS/Vercel/S3/Ably deployment model.

## Target Runtime

- Backend: FastAPI on Cloud Run in `europe-southwest1`.
- Database: PostgreSQL remains source of truth, using `DATABASE_CONNECTION_STRATEGY=alloydb` or `cloud_sql`.
- Secrets: Google Secret Manager JSON loaded through `KRESCO_GCP_RUNTIME_SECRET_NAME`.
- Media: Cloud Storage with private `gs://` object references and short-lived signed read URLs.
- Auth: Firebase Auth is the external identity provider; Postgres remains the authorization and entitlement source of truth.
- Realtime: Firestore is the target realtime provider for narrow UI state and outbox delivery. Postgres keeps durable business state. Backend outbox events publish to `realtimeChannels/{encodedChannel}/events`.
- Frontend: Next.js container on Cloud Run, optionally fronted by Firebase Hosting/CDN.

## Required Backend Runtime Env

```dotenv
KRESCO_ENV=staging
KRESCO_RELEASE_SHA=<git-sha>
GCP_PROJECT_ID=kresco-staging
GCP_REGION=europe-southwest1
KRESCO_GCP_RUNTIME_SECRET_NAME=<gcp-runtime-secret-version-name>
FIREBASE_PROJECT_ID=kresco-staging
FIREBASE_WEB_API_KEY=<firebase-web-api-key>
FIRESTORE_DATABASE=(default)
DATABASE_URL=<postgres-asyncpg-url>
DATABASE_CONNECTION_STRATEGY=alloydb
PGSSLROOTCERT=certifi
MEDIA_STORAGE_BACKEND=gcs
MEDIA_GCS_BUCKET=<private-media-bucket>
MEDIA_GCS_PREFIX=staging
MEDIA_GCS_SIGNED_URL_TTL_SECONDS=3600
KRESCO_RATE_LIMIT_STORAGE_URI=<shared-rate-limit-uri>
REALTIME_OUTBOX_SECRET=<32+ chars>
```

Provider credentials for VdoCipher, CMI, and Resend stay backend-only and should live inside the Secret Manager JSON, not frontend env vars.

## Required Frontend Runtime Env

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://<backend-cloud-run-url>/api
NEXT_PUBLIC_FIREBASE_API_KEY=<firebase-web-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=kresco-staging.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=kresco-staging
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<firebase-storage-bucket>
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<sender-id>
NEXT_PUBLIC_FIREBASE_APP_ID=<app-id>
NEXT_PUBLIC_FIRESTORE_DATABASE=(default)
NEXT_PUBLIC_REALTIME_PROVIDER=firestore
NEXT_PUBLIC_RELEASE_SHA=<git-sha>
```

## Local Validation

```powershell
docker build -f backend/Dockerfile backend
docker build -f frontend/Dockerfile frontend
cd backend; python -m pytest backend/tests_fastapi/test_image_uploads.py backend/tests_fastapi/test_startup_security.py -q
```

## Migration Order

1. Build and run backend container locally with SQLite and `MEDIA_STORAGE_BACKEND=gcs-mock`.
2. Build frontend container and point it at local backend.
3. Provision staging GCP/Firebase resources.
4. Store backend runtime JSON in Secret Manager.
5. Run Alembic against staging Postgres.
6. Deploy backend to Cloud Run staging.
7. Deploy frontend to Cloud Run staging.
8. Move media uploads to Cloud Storage and verify `gs://` references.
9. Add Firebase Auth token verification, preserve legacy Google provider IDs, and map Firebase UID to Postgres users.
10. Replace frontend Ably subscriptions with Firestore listeners through the provider-neutral realtime facade.
11. Run staging smoke tests for auth, course access, payments, media upload/read, and realtime.

Production cutover is blocked until staging proves those flows.
