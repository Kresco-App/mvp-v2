# Repo Cleanup Log

This file records repository cleanup decisions so future agents can trace what changed and why.

## 2026-06-05 - Generated artifact and scratch script cleanup

Goal: remove files that are provably outside runtime behavior and tighten hygiene gates so they do not return.

### Source cleanup

- Removed unreferenced one-off root/helper scripts: `dark_mode.py`, `find_missing.py`, `find_missing2.py`, `find_missing3.py`, `fix.py`, `fix_dump.py`, `validate_simps.py`, `scripts/split_professor.py`, and `scripts/append_bugs.py`.
- Removed tracked frontend dev/build output captures: `frontend/.next-dev-3001.err.log`, `frontend/.next-dev-3001.log`, `frontend/.next-dev-3001.out.log`, `frontend/build_stats.txt`, and `frontend/build_stats_utf8.txt`.
- Updated `scripts/check_repo_hygiene.py` to reject tracked `.log` files and the stale frontend build-stat captures.
- Updated `docs/backend-contract.md` so the current content model no longer claims active `Chapter`, `Lesson`, or `ChapterSection` routes exist.

### Verification target

- `python scripts/check_repo_hygiene.py`

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
- `Chapter`/`Lesson` models and routes were not removed in this cleanup. They still back existing screens and progress endpoints. A full removal requires a separate migration plan that replaces watch/admin/exam flows with TopicItem-first equivalents.

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
- Replaced the old deployment notes with current GCP deployment status and local validation rules.
- Replaced the old gateway integration doc with `docs/knowledge-base/access-billing.md`, which now describes the active payment endpoints and service behavior.
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

## 2026-05-27 - Repository hygiene gate

Goal: prevent local runtime artifacts and local environment files from re-entering tracked source.

### Machine gate

- Added `scripts/check_repo_hygiene.py`.
- Backend CI, Backend deploy, Frontend CI, and Frontend deploy now run the hygiene gate.
- The gate rejects tracked OS artifacts, local SQLite/database files, package tarballs, generated output directories, and non-example `.env` files.

### Artifact cleanup

- Deleted `.DS_Store` from the working tree.
- Deleted `backend/.DS_Store` from the working tree.
- Deleted tracked `.codex-logs` dev log files from the working tree.
- Deleted tracked backend `.next` trace files from the working tree.
- Deleted tracked validation SQLite files from the working tree.
- Backed up `backend/db.sqlite3` to ignored `.codex-logs/local-artifact-backups/backend-db.sqlite3.before-hygiene.sqlite3`.
- Stopped the local FastAPI dev server processes that held `backend/db.sqlite3` open and deleted the tracked runtime copy from the working tree.
- Deleted `frontend/es-toolkit-1.46.1.tgz` from the working tree.
- Added `*.tgz` to the root `.gitignore`.
- Moved the root `TODO-MANUAL.md` content into `docs/manual-operations.md` and deleted the root TODO file.

### Verification

- `python scripts/check_repo_hygiene.py`
- `python -m py_compile scripts/check_repo_hygiene.py`
