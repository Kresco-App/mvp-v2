# Backend Contract (Canonical Runtime)

## Source of truth
- Active backend runtime is **FastAPI** under `backend/app/**`.
- API entrypoint is `app.main:create_app`.
- Lambda entrypoint is `app_handler.application`.
- DB migration tool is **Alembic** (`alembic upgrade head`).

## Deprecated path
- Django/Ninja modules under `backend/core`, `backend/users`, `backend/courses`, etc. are legacy.
- `backend/manage.py` is intentionally blocked and must not be used for runtime or migrations.

## Rules for new changes
1. New backend features must be added only in `backend/app/**`.
2. New schema changes must ship with Alembic migrations.
3. CI must pass (`pytest`, startup check) before deployment.
