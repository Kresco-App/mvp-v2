# Deployment Status

Production deployment work is currently paused. This file records the current implementation boundary only.

## Current Local Runtime

- Frontend: Next.js app in `frontend`.
- Backend: FastAPI app in `backend/app`.
- Backend entrypoint: `app.main:create_app`.
- Lambda adapter present: `backend/app_handler.py`.
- Zappa settings file present: `backend/zappa_settings.json`.
- Database migrations: Alembic.
- Liveness endpoint: `/health`.
- Readiness endpoint: `/ready`, which checks production config policy and database connectivity.

## Current Production Shape

The intended production shape remains:

```text
Vercel Frontend
-> API Gateway
-> Lambda / FastAPI
-> RDS PostgreSQL
```

Deployment configuration should not be changed during normal product implementation unless the task is explicitly deployment-focused.
Backend deploy requires a `BACKEND_READY_URL` repository variable that points at the deployed `/ready` URL for the production stage.

## Current Validation Rule

Use local validation for implementation work:

```bash
cd backend
python -m pytest tests_fastapi

cd ../frontend
npm run lint
npm test
npm run build
```

For local server checks:

```bash
cd backend
python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000

cd ../frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

See `docs/knowledge-base/local-validation-only.md` for the active validation policy.
See `docs/manual-operations.md` for the current credential-dependent manual operations.
