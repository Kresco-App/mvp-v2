# Architecture and Infrastructure

## Current Backend Shape

Current runtime boundary:

```text
Next.js Frontend
-> FastAPI API
-> SQL database
```

Current production target remains:

```text
Vercel Frontend
-> API Gateway
-> Lambda / FastAPI
-> RDS PostgreSQL
```

Deployment work is paused during product implementation. Use local validation unless the task is explicitly deployment-focused.

## Active Runtime Files

- Backend factory: `backend/app/main.py`
- Lambda adapter: `backend/app_handler.py`
- Backend config: `backend/app/config.py`
- Database engine/session setup: `backend/app/database.py`
- API routers: `backend/app/routers/**`
- SQLAdmin registry: `backend/app/admin/views.py`
- Alembic migrations: `backend/alembic/versions/**`
- Frontend app: `frontend/app/**`
- Frontend API client: `frontend/lib/axios.js`

## Backend Responsibilities

FastAPI handles:

- Auth and user APIs.
- Subject, topic, item, tab, resource, and exam metadata.
- Access decisions and locked response shaping.
- Quiz grading and attempt tracking.
- Progress and XP tracking.
- Payments and Stripe webhooks.
- VdoCipher OTP generation.
- SQLAdmin-backed content operations.
- Notifications and calendar APIs.

## Current Scalability Rules

- Keep API requests short.
- Keep large media delivery outside FastAPI.
- Keep secrets server-side.
- Use Alembic for schema changes.
- Prefer indexed lookup paths for topic, quiz, XP, and admin overview queries.
- Keep XP awards idempotent where duplicate user actions are possible.

## Verification

Backend:

```bash
cd backend
python -m pytest tests_fastapi
```

Frontend:

```bash
cd frontend
npm run lint
npm test
npm run build
```
