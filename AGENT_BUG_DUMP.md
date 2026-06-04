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
- 2026-06-04 audit append: `python -m pytest -q` failed with 2 failures / 478 passes; see `BUG-P0-001` and `BUG-P0-006`.
- 2026-06-04 audit append: `python scripts/check_production_launch_gate.py --json` failed at score 5.5 / 9.0; see `BUG-P0-007`. `python scripts/check_http_readiness.py` failed because `BACKEND_READY_URL` is unset; see `BUG-P1-023`.
- 2026-06-04 audit append: `npm run audit:csp-styles -- --json` passed but reported 54 files with inline style debt and 113 inline `style` attributes; see `BUG-P1-029`.

Coverage audit for this rewrite:

- The old dump had 183 raw unresolved lines after extracting unchecked and unboxed audit findings from `HEAD:AGENT_BUG_DUMP.md`.
- Those lines were deduped into 38 active bug records, 23 architecture/product backlog bullets, and explicit fixed/stale archive notes.
- Current active bug count after `c9463ca` and validator cleanup: 31.
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

### P1 - Correctness, Security, and Scalability Bugs

#### BUG-P1-001 - Admin overview fans out per-metric request-time reads

Status: OPEN

Files: `backend/app/services/admin_overview.py`

Current evidence: `_gather_reads` is capped at two concurrent reads, but `build_admin_overview` still fans out per-metric session-backed reads across counts, rollups, readiness, progress, live events, interactions, and notifications.

Risk: admin dashboard refreshes still amplify per-request session/query overhead and table-scan pressure as the dataset grows.

Fix direction: keep the concurrency cap, then batch related aggregates or reuse one read session per overview phase with tests that bound `_run_read` calls or request query count.

#### BUG-P1-002 - Quiz discovery still performs per-candidate DB access checks

Status: OPEN

Files: `backend/app/routers/quizzes.py`, `backend/app/services/course_access.py`

Current evidence: `get_subject_quiz_discovery` loads up to 25 question sets, then calls `_question_set_access` inside a Python loop; each candidate can trigger parent lookups and repeated access-context work.

Risk: subject discovery remains O(N) in DB access checks.

Fix direction: build one access context, batch-load parent rows, and evaluate candidate access without one DB round trip per question set.

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

Files: `frontend/proxy.ts`, `frontend/scripts/audit-csp-styles.mjs`, `frontend/tests/proxy.test.ts`, `frontend/components/animated/source-ports/chemistry/components/interactive/IndicatorSimulator.tsx`, `frontend/components/animated/source-ports/physics/components/interactive/DiffractionLab.tsx`

Current evidence: runtime CSP still permits `style-src-elem 'unsafe-inline'` and `style-src-attr 'unsafe-inline'`. `npm run audit:csp-styles -- --json` passes only because the temporary budget allows up to 56 files and 114 attributes; the current report still has 54 files with inline style debt and 113 JSX `style` attributes.

Risk: the app cannot tighten CSP style directives without breaking UI, leaving a broad inline-style execution surface during the migration.

Fix direction: convert inline style attributes to classes/CSS variables, lower the audit budget to zero, and remove the unsafe inline style directives only after the audit reaches zero.

### P2 - User-Visible Flow Bugs

#### BUG-P2-002 - Leaderboard pagination/search requests can race

Status: OPEN

Files: `frontend/components/Leaderboard.tsx`

Current evidence: `fetchLeaderboard` issues requests without an `AbortController` or response-generation guard.

Risk: rapid search or pagination can let an older response overwrite the currently requested page/search state.

Fix direction: abort stale requests or ignore responses that do not match the latest search/page generation.

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
- Performance backlog: core dashboard routes still have heavy first-load JS in `frontend/.next/diagnostics/route-bundle-stats.json` (`/topics/[topicId]` 1,331,922 bytes, `/professor-chat` 1,297,824 bytes, `/live/[sessionId]` 1,290,379 bytes). Animated renderers are already dynamically loaded, so remaining work is profiling shared chunks, lazy-loading inactive tab panels, and adding a CI bundle budget/report.
