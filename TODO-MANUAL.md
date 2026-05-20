# Manual Operations

This file lists current operations that require credentials, provider dashboards, or content ownership.

## Local Runtime

Start backend:

```bash
cd backend
python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
```

Start frontend:

```bash
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

## Required Secrets

Set secrets in local environment files or deployment provider dashboards. Do not commit real values.

Backend:

```text
DATABASE_URL=
JWT_SECRET_KEY=
ADMIN_PASSWORD=
STRIPE_SK=
STRIPE_PK=
STRIPE_PRODUCT_ID=
STRIPE_WEBHOOK_SECRET=
VDOCIPHER_API_SECRET=
FRONTEND_URL=
```

Frontend:

```text
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

## Current Admin Surface

Use SQLAdmin at:

```text
http://127.0.0.1:8000/admin
```

Current content work should target:

- Subjects.
- Topics.
- TopicSections.
- TopicItems.
- Resources.
- TabContent.
- QuestionSets.
- Questions.
- Exams and ExamProblems.
- Access gates and publish state.

## Current Content Rule

Add a final `TopicSection`, for example `Synthese et Revision`, and place summary, animated courses, labs, quiz collections, notes, and resource collections there as normal path items.

## Verification Before Hand-off

```bash
cd backend
python -m pytest tests_fastapi

cd ../frontend
npm run lint
npm test
npm run build
```
