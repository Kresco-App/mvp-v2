# Agent Bug Dump

Last curated: 2026-06-04

This file is the active bug queue for Kresco. It is intentionally not the raw
agent transcript. Fixed, stale, duplicate, and false-positive findings live in
`AGENT_BUG_DUMP_ARCHIVE.md` so this active queue stays actionable.

Status rules:

- `OPEN`: validated against the current worktree and still actionable.
- `VERIFY`: plausible but needs one more code/test pass before implementation.
- `FIXED` or `STALE`: keep only in `AGENT_BUG_DUMP_ARCHIVE.md`.

When an item is fixed, move it out of `Active Queue` into the archive with the
commit hash and the validation command. Do not leave fixed bugs in the active
queue.

Last validation snapshot:

- Worktree was clean before this rewrite.
- Backend focused checks passed: course access, topic quiz, data integrity, migrations, grading, image uploads, professor platform, interactions, notifications.
- Frontend focused checks passed: auth/session, payments, dashboard search, topic workspace, video player, admin, profile, typecheck, and lint.
- Alembic head is `0047`.
- 2026-06-04 audit append: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm audit --omit=dev`, `python scripts/check_secret_hygiene.py`, and `python scripts/check_repo_hygiene.py` passed.
- 2026-06-04 audit append: `python -m pytest -q` failed with 2 failures / 484 passes; see `BUG-P0-001` and `BUG-P0-006`.
- 2026-06-04 audit append: `python scripts/check_production_launch_gate.py --json` failed at score 5.5 / 9.0; see `BUG-P0-007`. `python scripts/check_http_readiness.py` failed because `BACKEND_READY_URL` is unset; see `BUG-P1-023`.
- 2026-06-04 audit append: `npm run audit:csp-styles -- --json` passed but reported 54 files with inline style debt and 113 inline `style` attributes; see `BUG-P1-029`.
- 2026-06-04 deep audit append: focused locked-course-access tests passed, but the resource stream route still lacks a locked-primary-resource regression; see `BUG-P0-008`.
- 2026-06-04 deep audit append: strict subject validation rejects the current admin new-course payload extras `niveau` and `filiere`; see `BUG-P1-033`.
- 2026-06-04 deep audit append: course interactions, notifications/calendar, and profile/image upload focused suites passed, but interaction context conflict handling is still unguarded; see `BUG-P1-034`.
- 2026-06-04 continuation audit append: payment verification, professor chat read-state, calendar live access, and professor media rendering gained four new validated records; see `BUG-P1-035` through `BUG-P1-038`.
- 2026-06-04 continuation audit append: VdoCipher live auto-create has no provider cleanup after post-create DB failure; see `BUG-P1-039`.
- 2026-06-04 continuation audit append: student live-session pagination, professor chat subject scope, multi-channel realtime retry, and notification bulk delete gained four new validated records; see `BUG-P1-040`, `BUG-P1-041`, `BUG-P2-008`, and `BUG-P2-009`.
- 2026-06-04 dependency/config recheck: `npm audit --omit=dev` passed, `python -m pip_audit -r requirements.txt` was unavailable (`No module named pip_audit`), and `python scripts/check_production_launch_gate.py --json` still failed on the existing launch-readiness gate; see `BUG-P0-007`.
- 2026-06-04 interaction/deploy/admin audit continuation: deploy/admin/payment/media checks mostly mapped to existing records, but top-level interaction notes/saves still bypass access checks; see `BUG-P2-010`.
- 2026-06-04 topic workspace audit continuation: the generic topic `Mark complete` action ignores backend item-type and timed-completion rules; see `BUG-P2-011`.
- 2026-06-04 backend read-path audit continuation: topic workspace query count is bounded, but payload size and serialization still scale with every item/tab body in the topic; see `BUG-P2-012`.

Coverage audit for this rewrite:

- The old dump had 183 raw unresolved lines after extracting unchecked and unboxed audit findings from `HEAD:AGENT_BUG_DUMP.md`.
- Those lines were deduped into 38 active bug records, 23 architecture/product backlog bullets, and explicit fixed/stale archive notes.
- Current active bug count after this deep audit append: 48.
- A keyword coverage pass checked the old unresolved topic families against this file before staging.

## Active Queue

### P0 - Release Blockers

#### BUG-P0-001 - Leaderboard projection refresh locks the hot read path

Status: OPEN

Files: `backend/app/services/gamification_read_models.py`

Current evidence: `list_leaderboard_entries` calls `refresh_leaderboard_projection_if_stale` on dashboard/sidebar reads. If stale, the service selects every active `UserXP`, deletes all `LeaderboardRank` rows, builds ORM objects for every user, then flushes them inside the request transaction.

Current validation: `python -m pytest -q` is red on `tests_fastapi/test_gamification_routes.py::test_daily_quest_get_paths_skip_commit_when_quests_already_exist`; the test expected a read path not to commit, but observed `[True]`.

Risk: dashboard/sidebar reads can trigger table-wide delete/insert work, lock contention, and memory growth at scale.

Fix direction: move refresh to a scheduled/background projection job or replace the delete/reinsert path with chunked upserts and advisory locking.

#### BUG-P0-002 - Backend deploy serves new code before migrations complete

Status: OPEN

Files: `.github/workflows/deploy-backend.yml`

Current evidence: deploy runs `zappa deploy || zappa update` before invoking `app.scheduled.run_alembic_migrations_event`.

Risk: production traffic can hit new code against old schema; async Zappa invocation can hide migration failure from CI.

Fix direction: run and verify migrations before traffic reaches the new code, or deploy with a maintenance/compatibility gate and fail CI on migration failure.

#### BUG-P0-003 - Frontend integration E2E defaults to SQLite in CI

Status: OPEN

Files: `frontend/playwright.integration.config.ts`, `backend/scripts/prepare_e2e_db.py`, `.github/workflows/ci-frontend.yml`, `.github/workflows/deploy-frontend.yml`

Current evidence: the integration Playwright config and `prepare_e2e_db.py` default to `sqlite+aiosqlite:///./e2e.sqlite3`, and frontend CI/deploy run integration E2E without overriding that database URL to Postgres.

Risk: Postgres-specific SQL, JSON, constraints, and migrations can fail in production while integration tests pass.

Fix direction: run integration E2E against a Postgres service in CI.

#### BUG-P0-004 - Backend FastAPI pytest fixture bypasses Alembic migrations

Status: OPEN

Files: `backend/tests_fastapi/conftest.py`, `.github/workflows/ci-backend.yml`

Current evidence: backend CI runs a separate Alembic upgrade check, but the FastAPI pytest fixture rebuilds the test schema with `Base.metadata.drop_all` / `Base.metadata.create_all` instead of migrating the pytest database through Alembic.

Risk: Alembic upgrade syntax, missing constraints, downgrade hazards, and migration ordering can be invisible to the main test suite.

Fix direction: migrate test DBs with Alembic for at least the default backend suite, keeping a small fast metadata suite only if explicitly named.

#### BUG-P0-006 - TopicItemProgress topic_item_id FK lacks a leading index

Status: OPEN

Files: `backend/app/models/gamification.py`, `backend/alembic/versions/0044_topic_item_progress_user_item_status_index.py`, `backend/alembic/versions/0046_topic_item_progress_topic_item_fk.py`, `backend/alembic/versions/e34496201734_add_index_to_foreign_keys.py`, `backend/tests_fastapi/test_query_plan_audit.py`

Current evidence: `python -m pytest tests_fastapi/test_query_plan_audit.py -q` is red on `test_foreign_key_columns_are_indexed_or_index_leading` because `topic_item_progress.topic_item_id` is a cascading foreign key without a matching leading index. Existing indexes lead with `user_id`, so they do not satisfy lookups/cascades by `topic_item_id`.

Risk: topic-item deletes, joins, and query plans can degrade as progress rows grow, and the full backend suite is currently red.

Fix direction: add a migration and model index with `topic_item_id` as the leading column, then rerun the query-plan audit and full backend pytest.

#### BUG-P0-007 - Production launch gate remains below release threshold

Status: OPEN

Files: `scripts/check_production_launch_gate.py`, `PRODUCTION-SWITCH.md`, `docs/production-remediation-traceability.md`, `.github/workflows/deploy-backend.yml`, `.github/workflows/deploy-frontend.yml`

Current evidence: `python scripts/check_production_launch_gate.py --json` fails with current score 5.5 / target 9.0. The gate reports 12 unverified traceability rows: `SEC-CSP-STYLE-001`, `SEC-SECRETS-001`, `MEDIA-S3-001`, `MEDIA-AUTH-001`, `RT-FANOUT-001`, `RT-OUTBOX-001`, `PERF-TOPIC-001`, `FE-DEMO-001`, `OPS-STAGE-001`, `OPS-RDS-001`, `OPS-LAMBDA-001`, and `OPS-RUNBOOK-001`. Production deploy workflows enforce the gate.

Risk: release readiness can be claimed while required security, media, realtime, performance, frontend demo, and ops evidence is missing or stale.

Fix direction: verify or retire each traceability row with current commands/evidence and keep the launch gate failing until the score reaches the target.

#### BUG-P0-008 - Topic item stream bypasses resource-level locks

Status: OPEN

Files: `backend/app/routers/courses.py`, `backend/app/services/course_access.py`, `backend/app/services/interaction_mutations.py`, `backend/tests_fastapi/test_course_access.py`

Current evidence: `/api/courses/topic-items/{item_id}/stream` authorizes only `require_topic_item_access`, then loads `Resource` by `item.primary_resource_id` without checking `Resource.status == "published"` or running `access_context.decide_child(item_access, resource, subject_id=...)`. The canonical `/api/courses/resources/{resource_id}/open` path does both checks. Existing tests prove locked child resources are redacted from the workspace and locked topic items reject stream access, but there is no regression where the item is accessible and the primary video resource is `required_tier="pro"` or unpublished.

Risk: a student with access to a free/basic topic item can request stream credentials for a locked or draft primary video resource, bypassing paid-content and publish-state gates.

Fix direction: add a shared helper for primary-resource stream authorization, require published video resources, evaluate the resource decision as a child of the item decision, and add regressions for locked-resource and unpublished-resource stream requests.

### P1 - Correctness, Security, and Scalability Bugs

#### BUG-P1-001 - Admin overview fans out per-metric request-time reads

Status: OPEN

Files: `backend/app/services/admin_overview.py`

Current evidence: `_gather_reads` is capped at two concurrent reads, but `build_admin_overview` still fans out per-metric session-backed reads across counts, rollups, readiness, progress, live events, interactions, and notifications.

Risk: admin dashboard refreshes still amplify per-request session/query overhead and table-scan pressure as the dataset grows.

Fix direction: keep the concurrency cap, then batch related aggregates or reuse one read session per overview phase with tests that bound `_run_read` calls or request query count.

#### BUG-P1-002 - Quiz discovery checks access after a fixed candidate limit

Status: OPEN

Files: `backend/app/routers/quizzes.py`, `backend/app/services/course_access.py`, `backend/app/models/quizzes.py`, `backend/tests_fastapi/test_topic_quiz.py`

Current evidence: `get_subject_quiz_discovery` loads the first 25 published `QuestionSet` rows for a subject, then calls `_question_set_access` inside a Python loop and returns the first accessible candidate. `QuestionSet` rows can be standalone subject quizzes or inherit access through `topic_id`, `topic_item_id`, or `tab_content_id`, so access can vary inside one subject. The current topic-quiz regression seeds one question set and proves locked versus allowed subject scope, but it does not seed more than 25 inaccessible/locked candidates ahead of an accessible free-preview or entitled candidate.

Risk: quiz discovery can return `403` or `quiz: null` while an accessible quiz exists beyond the first 25 ordered rows, and the route still does O(N) parent/access database work for the capped candidate set.

Fix direction: build one access context, batch-load parent rows, and push enough subject/parent access filtering before candidate selection that accessible quizzes cannot be hidden behind locked rows. Add a regression with 25 locked candidates followed by one accessible candidate.

#### BUG-P1-003 - Legacy quiz submit corrupts attempt analytics

Status: OPEN

Files: `backend/app/routers/quizzes.py`

Current evidence: `submit_quiz` inserts `QuizAttempt(attempt_number=1)` and returns `xp_earned=0` for every legacy quiz submission.

Risk: duplicate attempt numbers, no XP parity with tab quizzes, and analytics divergence.

Fix direction: route legacy submissions through the same attempt numbering, idempotency, grading, and XP service used by tab quizzes.

#### BUG-P1-004 - Professor dashboard computes unread total with request-time SUM

Status: OPEN

Files: `backend/app/services/professor_queries.py`

Current evidence: `professor_dashboard` still computes `SUM(ProfessorChatConversation.unread_for_professor)` on each dashboard request even though mutation paths already maintain per-conversation unread counters.

Risk: per-request aggregate work grows with professor conversation count.

Fix direction: add a professor-scoped unread counter/read model, update it anywhere `unread_for_professor` is incremented, decremented, or zeroed, and test that the dashboard no longer issues the unread `SUM`.

#### BUG-P1-006 - Per-user watch accrual is only bounded per topic item

Status: OPEN

Files: `backend/app/services/course_progress.py`, `backend/app/services/course_topic_mutations.py`, `backend/app/services/xp.py`

Current evidence: watch-second bounding clamps only a single `(user_id, topic_item_id)` progress row, and completion XP uses item-scoped idempotency keys. Parallel tabs on different items can accrue independently.

Risk: a student can multiply progress and completion XP by running multiple timed items in parallel.

Fix direction: add a per-user watch-accrual ledger or wall-clock budget before item progress updates and XP awards.

#### BUG-P1-007 - XP service boundary still permits unkeyed award inserts

Status: OPEN

Files: `backend/app/services/xp.py`, `backend/app/models/gamification.py`

Current evidence: `award_xp` accepts `idempotency_key=None`, `award_xp_bulk` only dedupes keys that are present, and the uniqueness constraint applies only to non-null keyed awards.

Risk: future or legacy award paths can bypass idempotency and duplicate XP under retries or concurrency.

Fix direction: require non-null idempotency keys at the XP service boundary and add duplicate-concurrency tests for keyed awards.

#### BUG-P1-009 - Polymorphic saved/change-request targets can become dangling

Status: OPEN

Files: `backend/app/models/interactions.py`, `backend/app/models/professor.py`

Current evidence: `SavedItem` can be created for a missing target because missing context falls back instead of rejecting; `ProfessorChangeRequest` validates targets on create, but deletes of target rows are not reconciled.

Risk: saved items and professor change requests can point at deleted or nonexistent topics/items/tabs/resources and later render broken metadata.

Fix direction: reject missing targets in `save_user_item`, and add delete-time cleanup or a reconciler for saved/change-request rows.

#### BUG-P1-010 - Realtime outbox rows are never purged after publish/dead-letter

Status: OPEN

Files: `backend/app/services/realtime_outbox.py`, `backend/app/models/professor.py`

Current evidence: `process_realtime_outbox` publishes/retries/dead-letters rows, `requeue_failed_realtime_outbox` only resets retry/dead rows, and no scheduled/internal path deletes old published/dead rows.

Risk: high-volume live/chat events bloat storage and slow outbox scans.

Fix direction: add a retention purge for old `published`/`dead` rows, plus an efficient `(status, updated_at, id)`-style index and scheduled/internal entrypoint.

#### BUG-P1-013 - Cached user profile data is persisted in localStorage

Status: OPEN

Files: `frontend/lib/authSession.ts`, `frontend/lib/store.ts`

Current evidence: `writeStoredAuthSession` and `updateStoredAuthUser` persist the full `AuthUser` object in `localStorage["kresco_user"]`; server verification prevents auth-token forgery but not profile-data exposure.

Risk: email/name/avatar/tier/staff/profile context is readable by any script running in the origin, extensions, and local physical access.

Fix direction: minimize stored fields, move sensitive context to server verification, or use session-only memory where practical.

#### BUG-P1-015 - YouTube topic videos do not auto-track playback progress

Status: OPEN

Files: `frontend/app/(dashboard)/topics/[topicId]/page.tsx`, `frontend/lib/topicWorkspaceRendering.ts`

Current evidence: YouTube resources are rejected from the tracked `VideoPlayer` path and render through `VideoPlayerFrame`/iframe instead. Manual "Mark complete" still exists, but playback-based watched seconds/completion are not emitted.

Risk: YouTube-backed lessons do not auto-report watched seconds or completion based on playback.

Fix direction: use the YouTube IFrame Player API or a tracked wrapper that emits the same progress contract as VdoCipher.

#### BUG-P1-016 - VdoCipher completion can duplicate writes and lock after failed saves

Status: OPEN

Files: `frontend/components/VideoPlayer.tsx`

Current evidence: `reportCompletion` saves progress and then calls the parent `onComplete`, which can issue a second complete POST. It also sets the local completion lock before the async save succeeds, and missing/wrong backend duration has no native-duration fallback for the 90% path.

Risk: videos can fire duplicate completion writes or get stuck locally completed after a failed save until the lesson changes.

Fix direction: make one layer own completion persistence, reset completion locks on failed saves, and fall back to native player duration when backend duration is missing or wrong.

#### BUG-P1-017 - Video read contract lacks a resume checkpoint

Status: OPEN

Files: `frontend/components/VideoPlayer.tsx`, `backend/app/routers/courses.py`

Current evidence: `/topic-items/{item_id}/stream` returns only stream credentials, workspace `TopicItemOut` exposes progress status/best score but not watched/resume seconds, and `VideoPlayer` has no prop or seek path for saved position.

Risk: students lose their place and progress state is inconsistent.

Fix direction: expose `watched_seconds`/`resume_seconds` in the read contract, thread it into `VideoPlayer`, seek after player load, and flush progress on pagehide/unmount if needed.

#### BUG-P1-018 - Exam attempt state is not persisted across reloads

Status: OPEN

Files: `frontend/app/(dashboard)/exam/[subjectId]/page.tsx`

Current evidence: `answers`, `currentIdx`, `timeLeft`, `started`, submission state, and result are React state only; answers are sent only on final submit and the countdown is a plain interval.

Risk: refresh/crash resets timer and wipes in-progress exam answers.

Fix direction: persist start time and draft answers in localStorage or backend draft storage; derive remaining time from wall clock.

#### BUG-P1-019 - SectionQuiz crashes on empty sets and hides submit failures

Status: OPEN

Files: `frontend/components/SectionQuiz.tsx`

Current evidence: it dereferences `data.questions[currentIndex]` before an empty guard, and submit failure clears loading without visible error or retry state.

Risk: empty question sets crash the component, and rejected submissions leave the user without a clear retry/error affordance.

Fix direction: add empty-state UI, catch submission errors, and keep/retry draft answers.

#### BUG-P1-020 - Zed PDF viewer cannot pin embedded text or capture real snippets

Status: OPEN

Files: `frontend/components/zed/PdfViewer.tsx`

Current evidence: pin text reads parent `window.getSelection` while the PDF is in an iframe, and snip mode emits a text snippet containing only file/zone coordinates instead of extracted text or an image payload.

Risk: local/offline PDF viewing and study snippets are broken or degraded.

Fix direction: use pdf.js or a real selection bridge, and make snip mode emit actual PDF content, preferably an image snippet.

#### BUG-P1-021 - Zed scratchpad overwrites history across browser tabs

Status: OPEN

Files: `frontend/components/zed/Scratchpad.tsx`, `frontend/components/zed/ZedModeOverlay.tsx`

Current evidence: scratchpad history hydrates once from a per-user localStorage key and writes the whole history on every change, but it does not listen for `storage` events or merge external updates.

Risk: a second browser tab can write stale scratchpad history over newer notes/calculations from another tab.

Fix direction: listen for same-key `storage` events, handle clears, and reload or merge external history before later writes.

#### BUG-P1-023 - Release gates do not enforce provider reachability

Status: OPEN

Files: `backend/app/main.py`, `scripts/check_staging_runtime.py`, `.github/workflows/deploy-frontend.yml`, `.github/workflows/deploy-backend.yml`

Current evidence: provider reachability exists as an opt-in diagnostics flag, but `check_staging_runtime.py` and backend deploy only validate config presence; frontend deploy has no post-deploy smoke/health step.

Current validation: `python scripts/check_http_readiness.py` fails without `BACKEND_READY_URL`, so the readiness checker is not yet wired to an actual deployed backend target in this environment.

Risk: releases can pass app startup, DB, and config checks while Stripe/provider reachability or frontend deployment health is broken.

Fix direction: make the backend deploy verifier request/enforce provider reachability where safe, and add a frontend post-deploy smoke/health check.

#### BUG-P1-024 - Critical E2E specs self-skip while smoke tests over-mock APIs

Status: OPEN

Files: `frontend/tests/e2e/*.spec.ts`, `.github/workflows/ci-frontend.yml`

Current evidence: purchase flow self-skips without `KRESCO_ENV=development` and `FAKE_STRIPE_CHECKOUT=true`, live fanout self-skips without `ABLY_API_KEY`, and CI does not set those env vars. The smoke suite intercepts most `/api/` traffic with canned responses.

Risk: CI can report green while payment, realtime, and backend/frontend contract flows are broken.

Fix direction: split mocked smoke coverage from real-flow CI, set required test env for purchase/live specs, and fail CI if critical specs are skipped.

#### BUG-P1-025 - Data integrity audit runs against a schema-only unseeded DB

Status: OPEN

Files: `.github/workflows/ci-backend.yml`, `backend/scripts/audit_data_integrity.py`

Current evidence: CI runs `audit_data_integrity.py` immediately after Alembic upgrade, before any integrity-test seed data is loaded. The current audit checks duplicate groups rather than orphan rows.

Risk: duplicate SavedItem, DailyQuest, TopicItemProgress, and XP idempotency checks pass trivially on an empty schema.

Fix direction: seed representative integrity fixtures or run the audit against a dedicated seeded integrity-test dataset.

#### BUG-P1-027 - Live interaction fallback refresh replaces paginated history

Status: OPEN

Files: `frontend/lib/professor.ts`, `frontend/lib/liveSessionData.ts`, `frontend/app/(dashboard)/live/[sessionId]/page.tsx`, `frontend/app/professor/live/[sessionId]/page.tsx`

Current evidence: client fallback polling refetches the default live-interactions page without cursor params and replaces the SWR envelope. Backend routes already support `limit`/`before_id`, but the client does not merge refreshed pages into existing history.

Risk: long sessions can lose older locally cached interactions once the list exceeds the backend default page size.

Fix direction: make fallback refresh cursor-aware or merge fetched pages into existing interaction history instead of wholesale replacing it.

#### BUG-P1-028 - Exam Bank topic filter is applied after limit and hydration

Status: OPEN

Files: `backend/app/routers/courses.py`, `frontend/app/(dashboard)/exam-bank/page.tsx`

Current evidence: `/api/courses/exam-bank?topic_id=...` applies subject/year/title filters in SQL, orders and limits to 50 exams, hydrates exam problems, then applies `topic_id` filtering in Python per exam.

Risk: exams with matching topic problems outside the newest 50 rows are omitted, and the endpoint does unnecessary problem hydration before filtering.

Fix direction: push the `topic_id` predicate into SQL before ordering/limit and add a regression with more than 50 newer nonmatching exams plus an older matching exam.

#### BUG-P1-029 - CSP style migration remains incomplete under temporary budget

Status: OPEN

Files: `frontend/proxy.ts`, `frontend/scripts/audit-csp-styles.mjs`, `frontend/tests/proxy.test.ts`, `frontend/components/animated/source-ports/chemistry/components/interactive/IndicatorSimulator.tsx`, `frontend/components/animated/source-ports/physics/components/interactive/DiffractionLab.tsx`, `frontend/components/animated/source-ports/math/math-sets-lab/components/SetsInclusionAnimation.tsx`

Current evidence: runtime CSP still permits `style-src-elem 'unsafe-inline'` and `style-src-attr 'unsafe-inline'`. `npm run audit:csp-styles -- --json` passes only because the temporary budget allows up to 56 files and 114 attributes; the current report still has 54 files with inline style debt and 113 JSX `style` attributes. The audit reports `cssomStyleWrites=0`, but `SetsInclusionAnimation.tsx` dynamically creates a `<style>` tag, assigns `style.innerHTML`, and appends it to `document.head`; the scanner only counts `element.style.*`, `cssText`, and `setAttribute("style")`.

Risk: the app cannot tighten CSP style directives without breaking UI, and the scanner can under-report dynamic inline style injection while the migration budget appears green.

Fix direction: extend the CSP style audit to count dynamic style-tag creation and `innerHTML`/`textContent` injection, move the math source-port keyframes into CSS, convert inline style attributes to classes/CSS variables, lower the audit budget to zero, and remove unsafe inline style directives only after the audit reaches zero.

#### BUG-P1-030 - Course authoring APIs allow non-staff professors to mutate the global catalog

Status: OPEN

Files: `backend/app/routers/courses.py`, `frontend/app/admin/layout.tsx`, `docs/knowledge-base/professor-platform.md`, `backend/tests_fastapi/test_course_access.py`

Current evidence: the admin UI is wrapped in `AuthGuard requireStaff`, but backend `POST /api/courses/subjects` and `POST /api/courses/topics` use `get_current_user` plus `_require_course_admin`, which allows `user.role == "professor"` even when `is_staff` is false. The professor-platform docs say professor ownership must remain separated by course offering/track, and the current tests cover staff creation but do not assert direct API denial for non-staff professors.

Risk: any authenticated professor token can bypass the staff-only UI and directly create published global subjects/topics outside offering ownership and review boundaries.

Fix direction: make global course-catalog mutations staff-only, or split a professor-authoring endpoint that requires active offering ownership and creates scoped drafts. Add direct API tests for non-staff professor denial and staff acceptance.

#### BUG-P1-031 - Payment verification mutates state through GET

Status: OPEN

Files: `backend/app/routers/payments.py`, `backend/app/services/payment_lifecycle.py`, `backend/app/security/csrf.py`, `frontend/lib/payments.ts`

Current evidence: `GET /api/payments/verify-session` calls `verify_checkout_session_state`, which records a verification attempt and applies paid checkout state when Stripe reports the session as paid. The frontend calls this route with `apiClient.get(..., { headers: { "Idempotency-Key": ... } })`. CSRF middleware treats `GET` as safe, so the route bypasses the cookie-authenticated write protections that would apply to `POST`.

Risk: entitlement-changing payment verification is exposed as a safe/read method, so browser prefetching, crawlers, client retry layers, or CSRF assumptions can trigger writes unexpectedly.

Fix direction: migrate verification to `POST /payments/verify-session` with the same idempotency key and CSRF requirements as other mutating routes, keep any temporary GET path non-mutating or compatibility-only, and update frontend/tests.

#### BUG-P1-032 - Media quotas ignore orphaned uploaded objects

Status: OPEN

Files: `backend/app/services/user_profile.py`, `backend/app/services/professor_chat_mutations.py`, `backend/app/services/media_storage.py`

Current evidence: profile upload quota projection uses only `user.avatar_media_size` and `user.banner_media_size`, then writes a new UUID object key and overwrites the stored URL/size. Chat media quota sums current `ProfessorChatMessage.attachment_size` rows, but deleting a message deletes the DB row without deleting the stored object. `MediaStorage` exposes `put_object` only; there is no `delete_object`, storage ledger, or ref-count/garbage-collection path.

Risk: repeated avatar/banner replacements or upload-delete chat cycles can stay within database quota counters while accumulating unreferenced S3/local objects and storage cost.

Fix direction: add delete or retention semantics for replaced/deleted media, track uploaded objects in a ledger, reconcile orphaned objects, and make quota tests cover replace/delete cycles rather than only currently referenced bytes.

#### BUG-P1-033 - Admin course screens use subject track fields outside the backend contract

Status: OPEN

Files: `frontend/app/admin/courses/new/page.tsx`, `frontend/app/admin/courses/page.tsx`, `frontend/app/admin/courses/[subjectId]/page.tsx`, `backend/app/routers/courses.py`, `backend/app/schemas/courses.py`, `backend/app/schemas/limits.py`, `frontend/tests/adminCoursesSubjectPage.test.tsx`

Current evidence: the admin new-course page sends `{ title, description, niveau, filiere }` to `POST /api/courses/subjects`, but backend `SubjectCreateIn(StrictInputModel)` only accepts `title` and `description`. A direct validation check raises `extra_forbidden` for both `niveau` and `filiere`, because `StrictInputModel` uses `extra="forbid"`. The mismatch also affects reads: admin subject list/detail pages render `subj.niveau`, `subj.filiere`, `subject?.niveau`, and `subject?.filiere`, while backend `SubjectListOut` and `SubjectDetailOut` do not expose those fields.

Risk: the staff "Nouveau cours" flow can fail with a 422 before creating the subject and topics, and the admin list/detail screens can render missing track metadata while frontend tests still pass against mock-only subject shapes.

Fix direction: align the contract by removing `niveau`/`filiere` from the admin subject UI or adding a real track/offering-aware backend model and response schema. Add integration-style regressions that post the page's payload and render admin pages from real backend response shapes.

#### BUG-P1-034 - Interaction context merge accepts conflicting parent IDs

Status: OPEN

Files: `backend/app/services/interaction_context.py`, `backend/app/services/interaction_mutations.py`, `backend/tests_fastapi/test_course_interactions.py`

Current evidence: `infer_interaction_context` starts from client-supplied `subject_id`, `topic_id`, `topic_item_id`, and `tab_content_id`, then `_merge_context` keeps any non-null base value over inferred values. `create_user_note` and `save_user_item` persist `subject_id`, `topic_id`, `topic_item_id`, and `tab_content_id` from that merged dict after requiring access only when a topic item is resolved. Existing `tests_fastapi/test_course_interactions.py` pass for normal inferred context, dedupe, and locked item access, but there is no regression where a request targets an accessible tab/item while supplying a different parent `subject_id` or `topic_id`.

Risk: direct API clients can save notes or bookmarks against an accessible item while assigning them to the wrong subject/topic, corrupting filters, profile hub grouping, and future cleanup behavior tied to course hierarchy.

Fix direction: infer canonical context from the most specific target/tab/item, reject explicit parent IDs that conflict with inferred parents, and add note/save regressions for mismatched `subject_id` and `topic_id`.

#### BUG-P1-035 - Checkout verifier can burn the idempotency key on Stripe errors

Status: OPEN

Files: `backend/app/services/payment_lifecycle.py`, `backend/app/services/stripe_service.py`, `frontend/lib/payments.ts`, `backend/tests_fastapi/test_payments.py`, `backend/tests_fastapi/test_stripe_service.py`

Current evidence: `verify_checkout_session_state` records a `PaymentVerificationAttempt` before calling Stripe and only releases that attempt when the verifier raises `HTTPException(503)`. `verify_checkout_session` catches non-retryable `stripe.StripeError` and returns `CheckoutSessionVerification(is_paid=False)` instead of an unavailable state. The frontend sends a deterministic idempotency key derived from the session id, so the next success-page reload hits the duplicate branch and skips Stripe verification. Existing tests assert the lower-level "Stripe error returns false" behavior and duplicate suppression, but there is no regression that a provider failure leaves the same session verifiable afterward.

Risk: a transient or misclassified Stripe error can make a paid checkout look unpaid and permanently suppress re-verification for the frontend's stable idempotency key until manual intervention or a different client key is used.

Fix direction: distinguish "unpaid" from "provider unavailable", return or raise an unavailable state for Stripe lookup failures, release the verification attempt when the result is not authoritative, and add a lifecycle test that a failed Stripe lookup can be retried with the same frontend idempotency key.

#### BUG-P1-036 - Chat message GET routes clear unread counters

Status: OPEN

Files: `backend/app/routers/professor.py`, `backend/app/services/professor_chat_mutations.py`, `backend/tests_fastapi/test_professor_platform.py`

Current evidence: `GET /api/professor/chat/conversations/{conversation_id}/messages` calls `list_professor_messages_for_conversation`, which sets `unread_for_professor` to `0` and commits. `GET /api/professor/student-chat/conversations/{conversation_id}/messages` calls `list_student_messages_for_conversation`, which sets `unread_for_student` to `0` and commits. `test_professor_chat_messages_are_cursor_paginated` asserts both counters become `(0, 0)` after message-list GETs.

Risk: browser prefetches, refreshes, retries, crawlers, or accidental reads can mark conversations read without an explicit user action, and the write bypasses the mutating-method/CSRF boundary.

Fix direction: keep message-list GET routes read-only and move read acknowledgement to an explicit `POST`/`PATCH` mark-read route or an explicit client action. Update clients and tests so pagination does not mutate unread state.

#### BUG-P1-037 - Calendar live events bypass live-session entitlements

Status: OPEN

Files: `backend/app/services/calendar_read_models.py`, `backend/app/services/professor_queries.py`, `backend/app/services/professor_live_sessions.py`, `backend/tests_fastapi/test_calendar.py`, `backend/tests_fastapi/test_professor_platform.py`

Current evidence: calendar routes depend on `get_current_user`, then `can_view_broad_calendar` treats any `role == "professor"` as broad calendar access without requiring `get_current_professor_user` or ownership of the event/offering. For non-broad users, calendar visibility only checks whether a live session's `ProgramTrack.niveau` and `ProgramTrack.filiere` match the user. It does not call `build_access_context` or require `FeatureAccessRequirement("live_sessions")`. `calendar_event_out` exposes `join_url`, and live-session sync writes `event.join_url = session.join_url or f"/live/{session.id}"`. The same track-only selection appears in live notification fan-out: `student_ids_for_offering_query`, `notify_students_for_live`, and live-session creation insert `Notification` rows for all active students in the track without live entitlement checks. Adjacent professor-platform tests prove basic matching-track students are denied by `/api/professor/student-live-sessions` and live interaction routes with `feature_required:live_sessions`, while calendar tests only cover a mismatched legacy user.

Risk: a basic student in the right track can receive protected live notifications and see protected live calendar events and join URLs even though the canonical live-session APIs and realtime capability generation deny live access. A professor-role account that no longer has an active offering can also view broad calendar live details because the calendar route does not use the professor dependency.

Fix direction: reuse the live-session access decision in calendar list/detail queries and live notification fan-out, restrict professor broad access to staff or owned active offerings, hide or redact inaccessible live events and `join_url`, and add matching-track basic-student plus inactive-professor regressions for calendar list/detail and notification creation.

#### BUG-P1-038 - Professor chat attachment thumbnails use Next image optimization for S3 media

Status: OPEN

Files: `frontend/app/professor/chat/page.tsx`, `frontend/app/(dashboard)/professor-chat/page.tsx`, `frontend/next.config.mjs`, `backend/app/services/media_storage.py`, `frontend/tests/e2e/integration.spec.ts`

Current evidence: S3 media storage returns presigned `https://...` URLs for stored chat attachments. `next.config.mjs` production `remotePatterns` allow Google, Unsplash, and YouTube hosts, but not the configured S3 bucket or mock-S3 host. The student professor-chat page renders attachment images with `unoptimized`, while the professor inbox page renders `Image src={chatMediaUrl(message.attachment_url)}` without `unoptimized`. Integration specs assert professor chat uploads return mock-S3 URLs, but they do not assert the professor-side thumbnail can render through the Next image optimizer.

Risk: professor inbox attachment thumbnails can fail in production or integration environments when Next rejects the presigned S3 host, even though the student-side chat image uses the safe unoptimized path.

Fix direction: render professor chat attachments with the same unoptimized media path as student chat or add a production-safe remote pattern derived from media storage configuration. Add a render regression for professor-side S3/mock-S3 attachment thumbnails.

#### BUG-P1-039 - VdoCipher live auto-create can orphan provider streams

Status: OPEN

Files: `backend/app/services/professor_live_sessions.py`, `backend/app/services/vdocipher.py`, `backend/tests_fastapi/test_professor_platform.py`, `backend/tests_fastapi/test_vdocipher_service.py`

Current evidence: `create_professor_live_session` rolls back the current DB transaction before calling `create_live_stream`, then creates the local `LiveSession`, `CalendarEvent`, notifications, audit row, realtime event, and commits. If any DB flush/commit after the provider call fails, the VdoCipher live stream has already been created. `vdocipher.py` exposes `create_live_stream` but no delete/cancel cleanup API, and `delete_professor_live_session` only deletes local DB state/cancels the local calendar event. Existing tests cover provider failure before local session creation, but not local DB failure after provider success.

Risk: a transient database or constraint failure after VdoCipher creation can leave paid external live streams unmanaged by Kresco, with no local session for staff to find, delete, or audit.

Fix direction: add provider cleanup/compensation for post-create local failures, or reserve a local pending session before provider creation and reconcile it transactionally. Add a regression where `create_live_stream` succeeds and a later DB failure invokes cleanup or leaves a recoverable pending record.

#### BUG-P1-040 - Student live session list filters entitlement after pagination

Status: OPEN

Files: `backend/app/services/professor_queries.py`, `backend/app/services/realtime_access.py`, `backend/tests_fastapi/test_professor_platform.py`, `backend/tests_fastapi/test_realtime.py`

Current evidence: `student_live_sessions` builds an access context but the SQL query only filters active same-track live sessions, applies `order_by`, `offset`, and `limit`, and then removes unauthorized rows in a Python list comprehension with `access_context.decide_for(LIVE_SESSION_ACCESS_REQUIREMENT, subject_id=session.course_offering.subject_id)`. The realtime access service already pushes `CourseOffering.subject_id.in_(access_context.active_subject_ids)` into SQL before its live-session limit, and `test_ably_token_filters_subject_scope_before_live_session_limit` protects that behavior. The HTTP student-live test only asserts `limit=1` returns at most one row; it does not seed an inaccessible newer same-track session ahead of an accessible one.

Risk: a VIP/Platinum student with entitlement to only one subject can see `/live` return an empty or incomplete page when inaccessible same-track sessions sort ahead of accessible sessions, even though those accessible sessions exist and the realtime capability path knows how to scope before limiting.

Fix direction: apply the same subject-scope and feature checks used by `realtime_access` before `offset`/`limit` in `student_live_sessions`; when subject scope is enforced, constrain by `CourseOffering.subject_id.in_(access_context.active_subject_ids)`. Add a regression with `limit=1`, one inaccessible newer live session, and one accessible older live session.

#### BUG-P1-041 - Professor chat ignores teacher-chat subject scope

Status: OPEN

Files: `backend/app/services/access.py`, `backend/app/services/professor_chat_access.py`, `backend/app/services/professor_queries.py`, `backend/app/services/professor_chat_mutations.py`, `backend/tests_fastapi/test_access_service.py`, `backend/tests_fastapi/test_professor_chat_access.py`, `backend/tests_fastapi/test_professor_platform.py`

Current evidence: the access model declares `teacher_chat` as a VIP/Platinum feature, and access tests assert paid tiers and inactive subject rows enforce subject scope. The professor-chat path does not use that model: `professor_chat_eligibility` returns true solely from `effective_user_tier(user) in {"vip", "platinum"}`; `student_professor_chat_status` lists `student_offerings` by active track only; and `start_student_conversation_state`, student message listing, student sends, image sends, and deletes only call `ensure_student_professor_chat_access` plus conversation ownership/track checks. There is no `build_access_context`, no `FeatureAccessRequirement("teacher_chat")`, and no `CourseOffering.subject_id` decision in the chat eligibility or mutation path. Existing chat tests cover tier and track mismatch, but not subject-scoped VIP students.

Risk: a subject-scoped or revoked-subject VIP/Platinum student can list offerings, start conversations, and keep sending professor-chat messages for same-track subjects they do not own, bypassing the subject-entitlement contract used by course, quiz, live, and realtime access.

Fix direction: add a teacher-chat access requirement that evaluates both feature and `CourseOffering.subject_id`, filter student chat offerings/conversations before pagination, and enforce the same subject decision on start/send/image/delete. Add regressions for a VIP student entitled only to Mathematics attempting to list/start/chat on a same-track Physics offering.

### P2 - User-Visible Flow Bugs

#### BUG-P2-003 - Exam page side effect still runs inside timer state updater

Status: OPEN

Files: `frontend/app/(dashboard)/exam/[subjectId]/page.tsx`

Current evidence: the countdown `setTimeLeft` updater calls `handleSubmit()` when time reaches zero. `handleSubmit` has a ref guard, so the issue is the impure replayable updater rather than a guaranteed duplicate POST.

Risk: React retry/Strict Mode behavior can replay a state updater that performs submission side effects.

Fix direction: move timeout submission to an effect that reacts to derived `timeLeft === 0`.

#### BUG-P2-004 - Professor chat selection and filters are not URL-backed

Status: OPEN

Files: `frontend/app/professor/chat/page.tsx`, `frontend/app/(dashboard)/professor-chat/page.tsx`

Current evidence: professor chat keeps selected conversation, search, and unread filter in component state; the student professor-chat page keeps selected conversation and offering in component state. Neither route hydrates or updates those values through query params.

Risk: reload/share resets the chat workspace and drops the current conversation/thread context.

Fix direction: synchronize selection and filters with URL query params.

#### BUG-P2-008 - Multi-channel realtime subscriptions do not retry failed subscribe

Status: OPEN

Files: `frontend/lib/ably.ts`, `frontend/app/(dashboard)/calendar/page.tsx`, `frontend/app/(dashboard)/live/page.tsx`, `frontend/tests/ably.test.ts`, `frontend/tests/calendarViewModel.test.ts`, `frontend/tests/livePage.test.ts`

Current evidence: `subscribeKrescoRealtimeChannels` subscribes to the deduped channel list inside a single async IIFE. If `beforeSubscribe` or any `channel.subscribe(onMessage)` call fails, the catch handler reports the error and starts fallback polling when a fallback is provided, but it never re-runs the subscribe loop. Its connection-state handler for `connected` only stops fallback and polls once; unlike `subscribeKrescoRealtime`, it has no `ensureSubscribed` retry path. The calendar page uses this helper for `/realtime/subscriptions` channels without a fallback, and the live page uses fallback polling but never upgrades back to realtime after a transient subscribe failure. Current frontend tests only inspect source strings for fallback support and stable calendar refs; they do not mock a failed subscribe followed by a successful retry.

Risk: a transient Ably auth/capability/network failure during initial multi-channel subscribe can leave calendar live updates disconnected for the rest of the page session, and live-session lists can remain on 5-second polling until reload.

Fix direction: give `subscribeKrescoRealtimeChannels` the same retryable `ensureSubscribed` state machine as the single-channel helper, track already subscribed channels, keep fallback active until all target channels subscribe, retry on `connected`/auth renewal, and add a unit test where the first `subscribe` rejects and the second attempt succeeds.

#### BUG-P2-009 - Notification clear-all client omits the required confirmation token

Status: OPEN

Files: `frontend/lib/notifications.ts`, `frontend/components/TopNav.tsx`, `frontend/tests/topNavAccessibility.test.ts`, `backend/app/routers/notifications.py`, `backend/app/services/notifications.py`, `backend/tests_fastapi/test_notifications.py`

Current evidence: the backend bulk-delete route requires `confirmation_token: str = Query(default="", min_length=1)` and `delete_all_user_notifications` verifies a signed token generated by `GET /api/notifications/delete-all-confirmation`. Backend tests assert `DELETE /api/notifications` without a token returns `422` and only `DELETE /api/notifications?confirmation_token=...` succeeds. The frontend helper `deleteAllNotifications()` still calls `deleteJson('/notifications')`, and `TopNav.removeAllNotifications` calls that helper directly after animating removal. The only TopNav notification test mocks `deleteAllNotifications`; there is no frontend contract test for the confirmation fetch/delete sequence.

Risk: the "clear all notifications" UI always fails against the current backend contract, rolls back with "Could not clear notifications.", and users cannot bulk-clear notifications from the top nav.

Fix direction: add a frontend helper that fetches `/notifications/delete-all-confirmation`, passes the returned token to `DELETE /notifications`, and covers the flow in a TopNav or notifications data test. Keep the optimistic UI rollback path for token/delete failures.

#### BUG-P2-010 - Top-level interaction notes and saves bypass course access

Status: OPEN

Files: `backend/app/services/interaction_mutations.py`, `backend/app/services/interaction_context.py`, `backend/tests_fastapi/test_course_interactions.py`, `frontend/lib/profileViewModel.ts`

Current evidence: `create_user_note` and `save_user_item` infer context, but they only call `require_topic_item_access` when `context["topic_item_id"]` is populated. `infer_interaction_context` can resolve top-level `target_type="topic"` or a note with only `topic_id` to `{subject_id, topic_id}` without a topic item, so those writes never call `access_context.decide_for(topic, subject_id=...)`. The tests assert happy-path topic/question-set saves and locked inferred topic-item saves, but there is no regression for a locked topic-only save or note. The profile hub turns saved `target_type === "topic"` rows into `/topics/{topic_id}` deep links, so this bypass becomes visible as a saved locked course entry.

Risk: students can persist notes/bookmarks against locked top-level topics or subjects and surface them in profile saved-items, while item/tab/resource saves are correctly blocked. This weakens the access model and creates inconsistent UX around locked course content.

Fix direction: after context inference, enforce topic/subject access when no topic item is available. Add tests for locked `target_type="topic"`, locked `topic_id` notes, and conflict cases where a supplied subject/topic disagrees with the inferred target.

#### BUG-P2-011 - Topic workspace Mark complete ignores item completion contract

Status: OPEN

Files: `frontend/app/(dashboard)/topics/[topicId]/page.tsx`, `backend/app/services/course_topic_mutations.py`, `backend/tests_fastapi/test_topic_quiz.py`, `frontend/tests/e2e/integration.spec.ts`

Current evidence: the topic workspace renders the bottom `Mark complete` button for every accessible `activeItem` and wires it, primary `VideoPlayer.onComplete`, and `TabPanel.onItemComplete` to the same `completeActive` callback. That callback always posts `/courses/topic-items/{activeItem.id}/complete` with `{ watched_seconds: activeItem.duration_seconds || 0 }`. The backend completion service intentionally rejects quiz item types with `400 "Quiz items must be submitted through quiz endpoints"` and rejects timed/video items until accumulated watched seconds reach the required threshold with `409 "Topic item is not eligible for completion yet"`. Backend coverage asserts spoofed video completion and quiz completion are rejected, while the frontend E2E only clicks `Mark complete` on the seeded happy-path active item and expects `200`.

Risk: quiz topic items expose a generic completion button that can only fail instead of routing through quiz submission. Timed/video items expose a button that attempts full-duration completion immediately and receives a generic "Could not save progress." error until enough real watch progress exists. This creates broken UX and makes the frontend appear to encourage the exact spoof path the backend blocks.

Fix direction: derive completion affordances from item type and completion policy. Hide or disable the generic button for quiz items and timed/video items until the backend reports eligibility, and route quiz completion through quiz submit / video completion through actual player progress. Add frontend tests that render quiz and timed/video active items and assert the generic completion POST is unavailable or policy-aware.

#### BUG-P2-012 - Topic workspace payload scales with every item and tab body

Status: OPEN

Files: `backend/app/services/course_topic_read_models.py`, `backend/app/services/course_access.py`, `backend/app/schemas/courses.py`, `backend/tests_fastapi/test_course_access.py`

Current evidence: `build_topic_workspace` loads every published `TopicItem` for the topic, then loads every published `TabContent` for those item IDs, computes access for every item/tab/resource, and serializes `sections=section_outputs` plus `active_item=topic_item_out(...)`. `topic_item_out` includes `primary_resource`, `primary_tab`, and `tabs=[tab_content_out(...)]` for every published tab. `TabContentOut` includes full `content` and `config_json`, so accessible tabs send their full bodies/config in the workspace response even when they are not the active item. Existing coverage `test_topic_workspace_query_count_is_stable_with_many_items` seeds 25 items with tabs and asserts `item_count == 25` and query count `<= 12`; it proves query count is stable but also locks in an unpaged full-topic payload.

Risk: a single topic with many authored items, long tab bodies, or rich quiz/config JSON can create large response bodies and CPU serialization work on every workspace load, refresh, search, or item switch. This is a backend performance issue even if SQL query count stays bounded, and it also drives frontend hydration/render cost for inactive item content.

Fix direction: split the workspace contract into a lightweight navigation outline plus active-item detail, or return tab bodies/config only for the active item and fetch inactive item detail on demand. Add a regression that budgets serialized response size or asserts inactive tabs omit heavy `content`/`config_json` while preserving locked-content redaction tests.

## Architecture and Product Backlog

These are not active correctness bugs unless a later validator proves a user-facing failure. Keep them separate from the bug queue.

- `frontend/public/sw.js` / PWA: offline mode, push opt-in, and offline fallback are not implemented.
- `frontend/components/VideoQuizOverlay.tsx`: video checkpoints are still a `return null` feature stub.
- Course progress/XP coverage is partial for notes edited, exam problem opened/attempted, lab opened/completed, and similar product-model actions.
- Daily XP/quest reset policy is UTC-only because account-local timezone is not modeled; keep this as product policy/schema work unless a concrete exploit is proven.
- Tab quiz answers and professor change-request JSON are already structurally bounded; stronger semantic/domain typing is backlog unless a concrete runtime failure is proven.
- Topic search lacks first-class difficulty-tag API fields.
- Embedded source-port wave/optics course navigation is inert in product embeds.
- Account settings and notifications inbox are shallow compared with the product docs.
- Seed-first Bac content pipeline is missing the documented `seed_kresco_v1.py` and `seed_burner_data.py` entry points.
- Admin course authoring remains a shell for full sections/items/resources/tab content/questions/exam problems/publish workflows.
- Activity builder is clipboard/manual and does not persist content.
- Ops emergency disable controls for payments/live/uploads/media are not implemented.
- Professor router/platform tests, SQLAdmin registry, and `backend/app/services/professor_live_sessions.py` live-session transition code remain large and should be split/refactored.
- `frontend/components/quiz/QuizPrimitiveRenderers.tsx` and `frontend/components/figma/profile.tsx` remain large component files and should be decomposed.
- `frontend/app/(dashboard)/professor-chat/page.tsx` still mixes data loading, state, and multiple views in one broad component.
- `backend/app/services/professor_chat_mutations.py` still duplicates professor/student mutation flows and should move to a shared actor-policy pipeline.
- `frontend/tests/e2e/integration.spec.ts` and `frontend/tests/e2e/next16-smoke.spec.ts` remain broad E2E monoliths.
- `backend/tests_fastapi/test_professor_platform.py` still needs fixture extraction and feature-based splitting.
- Relationship cascade/passive-delete behavior is only partially audited; keep a data-integrity backlog item for ORM relationship deletes versus DB `ON DELETE`.
- Source-ported interactive labs still carry broad file-level lint disables.
- Math sets source port still contains visible placeholder interactive content.
- PII scrubbing/retention policy needs a broader pass for email dispatch, telemetry, and deleted users.
- Repository hygiene should explicitly decide how to handle generated artifacts and whether local untracked/ignored artifacts should be reported during agent audits.
- Professor workspace switching is product/backlog unless a real role-switch session model is implemented. Current auth intentionally separates professor routes from student routes, while eligible non-professors already have a limited `Professor Chat` shortcut.
- Performance backlog: core dashboard routes still have heavy first-load JS in `frontend/.next/diagnostics/route-bundle-stats.json` (`/topics/[topicId]` 1,332,953 bytes, `/professor-chat` 1,298,855 bytes, `/live/[sessionId]` 1,291,410 bytes). Animated renderers are already dynamically loaded, so remaining work is profiling shared chunks, lazy-loading inactive tab panels, and adding a CI bundle budget/report.
