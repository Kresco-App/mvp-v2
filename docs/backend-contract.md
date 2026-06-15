# Backend Contract

## Active Runtime

- Runtime: FastAPI.
- Application factory: `backend/app/main.py`, `app.main:create_app`.
- Lambda adapter: `backend/app_handler.py`, `application`.
- API routers: `backend/app/routers/**`.
- SQLAlchemy models: `backend/app/models/**`.
- Pydantic schemas: `backend/app/schemas/**`.
- Migrations: Alembic under `backend/alembic/**`.
- Tests: `backend/tests_fastapi/**`.

## Database Contract

Run migrations from `backend`:

```bash
python -m alembic upgrade head
```

New schema changes must include an Alembic migration and matching SQLAlchemy model updates.

## Current Content Model

New product work should target the Topic model:

```text
Subject
-> Topic
-> TopicSection
-> TopicItem
-> TabContent / Resource
```

Historical `Chapter`, `Lesson`, and `ChapterSection` routes are no longer active runtime surfaces. Remaining `lesson` naming in schemas, stats, tests, or UI copy is compatibility terminology around `TopicItem`-first learning content.

## Current Verification

Use:

```bash
python -m pytest tests_fastapi
```

The backend must start through:

```bash
python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
```
