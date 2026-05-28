# Current Implementation Status

This file is the current implementation map.

## Implemented Core

- FastAPI backend under `backend/app`.
- Alembic migrations under `backend/alembic`.
- SQLAdmin registry under `backend/app/admin/views.py`.
- Topic model: `Subject`, `Topic`, `TopicSection`, `TopicItem`, `Resource`, `TabContent`, `ConceptTag`.
- Quiz model: `QuestionSet`, `Question`, `QuizAttempt`, `QuestionAttempt`.
- Progress and XP model: `TopicItemProgress`, `ActivityEvent`, `UserXP`, `XPTransaction`.
- Access decisions through `backend/app/services/access.py`.
- Topic workspace API through `GET /api/courses/topics/{topic_id}/workspace`.
- Topic quiz submission through `POST /api/courses/tabs/{tab_id}/quiz/submit`.
- Admin overview API through `backend/app/routers/admin.py`.
- Frontend Topic Workspace page at `frontend/app/(dashboard)/topics/[topicId]/page.tsx`.
- Animated content registry under `frontend/components/animated`.
- Quiz primitive showcase under `frontend/components/quiz`.

## Current Product Direction

The active learning model is:

```text
Subject
-> Topic
-> TopicSection
-> TopicItem
-> TabContent / Resource
```

The Topic Workspace uses one Main Path rail. Revision and practice collections belong in the final `TopicSection`, not in a separate tools mode.

## Compatibility Surfaces

These remain active because current screens and tests still depend on them:

- `Chapter`
- `Lesson`
- `ChapterSection`
- `LessonProgress`
- `/api/courses/lessons/**`
- `/api/courses/chapters/**`
- `/api/progress/lessons/**`

New learning-room work should prefer TopicItem-first models and endpoints.

## Current Verification

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
