# Repo Cleanup Log

This file records repository cleanup decisions so future agents can trace what changed and why.

## 2026-05-16 - Topic Workspace cleanup

Goal: remove stale Study Tools wiring and clean local runtime artifacts while preserving the new Topic/TopicSection/TopicItem/TabContent model.

### Source cleanup

- Removed the backend `study_tools` response branch from the topic workspace endpoint.
- Removed `StudyToolsOut` from the course schemas.
- Removed the frontend `Path | Study Tools` workspace mode and the `StudyToolsPanel`.
- Kept all review/practice content inside the normal topic section rail. The intended structure is now a final `TopicSection`, for example `Synthese et Revision`, containing summary video, animated courses, labs, quizzes, notes, and resources as normal path items.
- Confirmed there are no remaining `study_tools`, `StudyTools`, or visible `Study Tools` references in backend/frontend source.

### Documentation cleanup

- Updated the knowledge base to describe one guided Main Path plus a final revision section.
- Updated the historical `docs/content-semantics.md` file so it no longer describes the old tools mode as active product direction.
- Updated the project knowledge-base index to describe the topic workspace as path rail plus final revision, not path/tools.

### Runtime artifact cleanup

- Deleted untracked generated logs from `.codex-logs`.
- Deleted untracked Next.js runtime log files from `frontend`.
- Deleted the untracked screenshot artifact `.codex-quiz-dom.png`.
- Added ignore rules for `.codex-logs/`, Next build output, local logs, local SQLite/db files, and the local quiz DOM screenshot.

### Intentionally not removed

- Existing tracked SQLite files and tracked dev log files were not deleted. They are already tracked by git, so removing them should be handled as an explicit repository policy change with `git rm --cached` or a migration to seed-only fixtures.
- Legacy `Chapter`/`Lesson` models and routes were not removed in this cleanup. They still back existing screens and progress endpoints. A full removal requires a separate migration plan that replaces old watch/admin/exam flows with TopicItem-first equivalents.

### Verification

- `python -m pytest tests_fastapi`
- `npm run lint`
- `npm test`
- `npm run build`

## 2026-05-16 - Markdown freshness pass

Goal: make Markdown files reflect the current implementation only.

### Documentation rewritten

- Replaced the long historical `docs/content-semantics.md` with a current content semantics contract.
- Replaced `docs/backend-contract.md` with the active FastAPI/Alembic/backend contract.
- Replaced `docs/aws-deployment.md` with current deployment status and local validation rules.
- Replaced `docs/stripe-integration.md` with the currently implemented payment endpoints and service behavior.
- Replaced `docs/vdocipher-integration.md` with the current VdoCipher OTP service contract.
- Replaced the generic `frontend/README.md` with current frontend runtime and verification commands.
- Replaced `TODO-MANUAL.md` with current manual operations only.
- Replaced planning-style knowledge-base files with current implementation status, access, notes, progress, and topic workspace contracts.

### Documentation removed

- Removed `docs/knowledge-base/future-features.md` from the active knowledge base because it was speculative and not current implementation.
- Renamed `docs/knowledge-base/implementation-phases.md` to `docs/knowledge-base/current-implementation-status.md`.

### Verification

- Searched Markdown, excluding this audit log, for stale planning terms and obsolete Study Tools/Django/Figma references.
- Remaining flagged Markdown term is `course-card-placeholder.png`, which is an actual current asset filename referenced by the design-token doc.
