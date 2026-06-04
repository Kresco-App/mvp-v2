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

Coverage audit for this rewrite:

- The old dump had 183 raw unresolved lines after extracting unchecked and unboxed audit findings from `HEAD:AGENT_BUG_DUMP.md`.
- Those lines were deduped into 38 active bug records, 23 architecture/product backlog bullets, and explicit fixed/stale archive notes.
- Current active bug count after `beaef01`: 34.
- A keyword coverage pass checked the old unresolved topic families against this file before staging.

## Active Queue

### P0 - Release Blockers

#### BUG-P0-001 - Leaderboard projection refresh locks the hot read path

Status: OPEN

Files: `backend/app/services/gamification_read_models.py`

Current evidence: `list_leaderboard_entries` calls `refresh_leaderboard_projection_if_stale` on dashboard/sidebar reads. If stale, the service selects every active `UserXP`, deletes all `LeaderboardRank` rows, builds ORM objects for every user, then flushes them inside the request transaction.

Risk: dashboard/sidebar reads can trigger table-wide delete/insert work, lock contention, and memory growth at scale.

Fix direction: move refresh to a scheduled/background projection job or replace the delete/reinsert path with chunked upserts and advisory locking.

#### BUG-P0-002 - Backend deploy serves new code before migrations complete

Status: OPEN

Files: `.github/workflows/deploy-backend.yml`

Current evidence: deploy runs `zappa deploy || zappa update` before invoking `app.scheduled.run_alembic_migrations_event`.

Risk: production traffic can hit new code against old schema; async Zappa invocation can hide migration failure from CI.

Fix direction: run and verify migrations before traffic reaches the new code, or deploy with a maintenance/compatibility gate and fail CI on migration failure.

#### BUG-P0-003 - Frontend integration E2E uses SQLite instead of Postgres

Status: OPEN

Files: `frontend/playwright.integration.config.ts`, `backend/scripts/prepare_e2e_db.py`

Current evidence: default integration database URL is `sqlite+aiosqlite:///./e2e.sqlite3`.

Risk: Postgres-specific SQL, JSON, constraints, and migrations can fail in production while integration tests pass.

Fix direction: run integration E2E against a Postgres service in CI.

#### BUG-P0-004 - Backend pytest bypasses Alembic migrations

Status: OPEN

Files: `backend/tests_fastapi/conftest.py`

Current evidence: test DB setup calls `Base.metadata.create_all`.

Risk: Alembic upgrade syntax, missing constraints, downgrade hazards, and migration ordering can be invisible to the main test suite.

Fix direction: migrate test DBs with Alembic for at least the default backend suite, keeping a small fast metadata suite only if explicitly named.

### P1 - Correctness, Security, and Scalability Bugs

#### BUG-P1-001 - Admin overview still does request-time query/session churn

Status: OPEN

Files: `backend/app/services/admin_overview.py`

Current evidence: `_gather_reads` is capped at two concurrent reads, but `build_admin_overview` still issues many separate session-backed reads across counts, rollups, readiness, progress, live events, interactions, and notifications.

Risk: admin dashboard refreshes still amplify per-request session/query overhead and table-scan pressure as the dataset grows.

Fix direction: keep the concurrency cap, then batch related aggregates or reuse one read session per overview phase with tests that prove query/session churn drops.

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

#### BUG-P1-004 - Professor dashboard unread aggregate remains request-time work

Status: OPEN

Files: `backend/app/services/professor_queries.py`

Current evidence: `professor_dashboard` still computes `SUM(ProfessorChatConversation.unread_for_professor)` on each dashboard request even though unread counts are already maintained per conversation.

Risk: per-request aggregate work grows with professor conversation count.

Fix direction: add a professor-level unread cache/materialized counter, update it in chat mutation paths, and test that the dashboard no longer issues the unread `SUM`.

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

#### BUG-P1-011 - Deleting unread sent messages does not reconcile conversation counters

Status: OPEN

Files: `backend/app/services/professor_chat_mutations.py`

Current evidence: `delete_chat_message_state` deletes the sender-owned message and refreshes preview, but never decrements the recipient-side conversation unread counter.

Risk: unread badges remain inflated until a read path resets them.

Fix direction: decrement the relevant unread counter when deleting an unread message, guarded by behavioral tests.

#### BUG-P1-013 - Cached user profile data is persisted in localStorage

Status: OPEN

Files: `frontend/lib/authSession.ts`, `frontend/lib/store.ts`

Current evidence: `writeStoredAuthSession` and `updateStoredAuthUser` persist the full `AuthUser` object in `localStorage["kresco_user"]`; server verification prevents auth-token forgery but not profile-data exposure.

Risk: email/name/avatar/tier/staff/profile context is readable by any script running in the origin, extensions, and local physical access.

Fix direction: minimize stored fields, move sensitive context to server verification, or use session-only memory where practical.

#### BUG-P1-014 - Failed logout clears local state before server revocation succeeds

Status: OPEN

Files: `frontend/lib/store.ts`

Current evidence: `logout()` clears local auth/session state and SWR cache before `/api/auth/logout` succeeds; on fetch failure the UI is logged out while the backend cookie/token-version session may remain valid.

Risk: if backend revocation fails, the HttpOnly cookie can remain valid while the client appears logged out; refresh can recover the server-backed session.

Fix direction: keep a pending logout state until revocation finishes, then clear local state; expose a hard failure state when the server cookie cannot be revoked.

#### BUG-P1-015 - YouTube topic videos bypass progress tracking

Status: OPEN

Files: `frontend/app/(dashboard)/topics/[topicId]/page.tsx`

Current evidence: YouTube resources render through `VideoPlayerFrame`/iframe instead of the tracked `VideoPlayer` path.

Risk: watched seconds and auto-completion are never reported for YouTube lessons.

Fix direction: use the YouTube IFrame Player API or a tracked wrapper that emits the same progress contract as VdoCipher.

#### BUG-P1-016 - VdoCipher completion has progress edge failures

Status: OPEN

Files: `frontend/components/VideoPlayer.tsx`

Current evidence: zero/missing duration creates the old zero-duration completion lock; the iframe sandbox lacks `allow-same-origin`; completion is marked reported before network success, creating the old offline completion permanent lock; parent and player can both trigger duplicate completion API requests.

Risk: videos can fail to complete, fire duplicate writes, or permanently lock progress after a network failure.

Fix direction: read native player duration when backend duration is missing, allow the required sandbox origin, dedupe parent/player completion, and reset completion locks on failed saves.

#### BUG-P1-017 - Video progress does not resume after reload/tab switch

Status: OPEN

Files: `frontend/components/VideoPlayer.tsx`, `backend/app/routers/courses.py`

Current evidence: the stream/progress path does not provide a resume checkpoint to seek the player on mount.

Risk: students lose their place and progress state is inconsistent.

Fix direction: return latest checkpoint from the backend and seek the player after load.

#### BUG-P1-018 - Exam mode timer and answers are volatile client state

Status: OPEN

Files: `frontend/app/(dashboard)/exam/[subjectId]/page.tsx`

Current evidence: `started`, `timeLeft`, and `answers` are React state only.

Risk: refresh/crash resets timer and wipes in-progress exam answers.

Fix direction: persist start time and draft answers in localStorage or backend draft storage; derive remaining time from wall clock.

#### BUG-P1-019 - SectionQuiz crashes or hides failures on empty/offline submits

Status: OPEN

Files: `frontend/components/SectionQuiz.tsx`

Current evidence: it dereferences `data.questions[currentIndex]` without an empty guard, and `submitQuiz` has `try/finally` without a user-visible catch.

Risk: empty question sets crash the tree; offline submission failures silently reset the loading state.

Fix direction: add empty-state UI, catch submission errors, and keep/retry draft answers.

#### BUG-P1-020 - Zed PDF viewer cannot reliably pin or capture PDF content

Status: OPEN

Files: `frontend/components/zed/PdfViewer.tsx`

Current evidence: the iframe sandbox is only `allow-downloads`; pin text reads parent `window.getSelection`; snipping stores hardcoded text instead of an image.

Risk: local/offline PDF viewing and study snippets are broken or degraded.

Fix direction: allow the required viewer permissions or use pdf.js, implement a selection bridge, and capture snippets as images.

#### BUG-P1-021 - Zed scratchpad overwrites history across tabs

Status: OPEN

Files: `frontend/components/zed/Scratchpad.tsx`

Current evidence: state hydrates from localStorage on mount and writes on change, but does not listen for `storage` updates.

Risk: multiple Zed tabs can overwrite newer notes/calculations with stale state.

Fix direction: merge or reload external storage changes before writing.

#### BUG-P1-022 - Zed math parser uses unbounded recursive exponent parsing

Status: OPEN

Files: `frontend/lib/zedMath.ts`

Current evidence: `power()` recursively calls itself on every `^`.

Risk: deeply chained powers can exhaust the call stack and freeze the tab.

Fix direction: parse exponent chains iteratively or enforce a maximum expression depth.

#### BUG-P1-023 - Deployment/runtime checks do not prove provider readiness

Status: OPEN

Files: `backend/app/main.py`, `scripts/check_staging_runtime.py`, `.github/workflows/deploy-frontend.yml`, `.github/workflows/deploy-backend.yml`

Current evidence: readiness checks mostly validate configuration presence, backend startup uses SQLite, and frontend deploy lacks post-deploy health checks.

Risk: invalid provider credentials or runtime env gaps pass CI and fail after deploy.

Fix direction: add provider auth probes where safe, Postgres-backed startup checks, and post-deploy smoke/health verification.

#### BUG-P1-024 - Critical E2E flows are skipped or over-mocked in CI

Status: OPEN

Files: `frontend/tests/e2e/*.spec.ts`, `.github/workflows/ci-frontend.yml`

Current evidence: purchase and live fanout tests skip without `FAKE_STRIPE_CHECKOUT` or real `ABLY_API_KEY`; smoke tests heavily mock backend routes.

Risk: CI can report green while payment, realtime, and backend/frontend contract flows are broken.

Fix direction: add a seeded integration lane with required fake Stripe and Ably/local realtime config, and reserve mocked tests for UI smoke only.

#### BUG-P1-025 - Data integrity audit runs against an empty DB

Status: OPEN

Files: `.github/workflows/ci-backend.yml`, `backend/scripts/audit_data_integrity.py`

Current evidence: CI runs the audit after Alembic upgrade on a fresh database.

Risk: duplicate/orphan/XP-collision checks pass trivially.

Fix direction: seed representative bad/good fixtures or run the audit against a seeded integrity-test dataset.

#### BUG-P1-027 - Live interaction fallback polling is unpaginated

Status: OPEN

Files: `frontend/lib/professor.ts`, `frontend/lib/liveSessionData.ts`, `frontend/app/(dashboard)/live/[sessionId]/page.tsx`

Current evidence: `listStudentLiveInteractions(id)` calls the interactions endpoint with no cursor params, while realtime fallback polling repeatedly refreshes room data.

Risk: fallback polling can replace the local live room history with only the backend default page.

Fix direction: make fallback polling cursor-aware or merge fetched pages without dropping older local interactions.

### P2 - User-Visible Flow Bugs

#### BUG-P2-001 - Leaderboard can spoof the current user on empty/unranked pages

Status: OPEN

Files: `frontend/components/Leaderboard.tsx`

Current evidence: `currentUser` falls back to `visibleEntries[0]` when no entry is marked `is_current_user`.

Risk: a new/unranked user can be shown as the first ranked user in the sidebar/header card.

Fix direction: require an explicit current-user entry or render an unranked empty state.

#### BUG-P2-002 - Leaderboard pagination/search requests can race

Status: OPEN

Files: `frontend/components/Leaderboard.tsx`

Current evidence: `fetchLeaderboard` issues requests without an `AbortController` or response-generation guard.

Risk: rapid search or pagination can let an older response overwrite the currently requested page/search state.

Fix direction: abort stale requests or ignore responses that do not match the latest search/page generation.

#### BUG-P2-003 - Exam page side effect still runs inside timer state updater

Status: OPEN

Files: `frontend/app/(dashboard)/exam/[subjectId]/page.tsx`

Current evidence: the countdown `setTimeLeft` updater calls `handleSubmit()` when time reaches zero.

Risk: React retry/Strict Mode behavior can duplicate side effects.

Fix direction: move timeout submission to an effect that reacts to derived `timeLeft === 0`.

#### BUG-P2-004 - Professor chat layout state is lost on reload

Status: OPEN

Files: `frontend/app/professor/chat/page.tsx`, `frontend/app/(dashboard)/professor-chat/page.tsx`

Current evidence: selected conversation, search, and unread filter are kept as component state.

Risk: reload/share resets the chat workspace and drops active context.

Fix direction: synchronize selection and filters with URL query params.

#### BUG-P2-005 - Professor/student role switching has no bridge

Status: OPEN

Files: `frontend/components/TopNav.tsx`, `frontend/components/ProfessorTopNav.tsx`

Current evidence: professors/staff viewing the student app have no obvious return path to professor/admin workspaces, and professor nav has no student-view bridge.

Risk: role-based QA and dual-role workflows are awkward and easy to strand.

Fix direction: add a role switcher/dropdown for users with professor/staff privileges.

#### BUG-P2-006 - Admin privilege boundary can be hidden by frontend fallback copy

Status: VERIFY

Files: `frontend/app/admin/page.tsx`, `frontend/components/AuthGuard.tsx`, `backend/app/routers/admin.py`

Current evidence: frontend staff gating and backend admin permissions should be rechecked for exact parity after recent admin retry/error fixes.

Risk: users see confusing "staff required" UI when backend actually requires a stronger privilege.

Fix direction: validate backend requirements and mirror them in frontend route policy.

### P3 - Minor Performance and Cleanup Bugs

#### BUG-P3-001 - AuthGuard can refetch profile unnecessarily on role-gated routes

Status: OPEN

Files: `frontend/components/AuthGuard.tsx`

Current evidence: the guard always verifies through `getMyProfile` when its effect resets around token/role-gate changes.

Risk: low-severity extra profile requests during login/role-gated navigation.

Fix direction: keep the server verification requirement, but avoid duplicate calls when the already-verified profile and requirement have not changed.

## Architecture and Product Backlog

These are not active correctness bugs unless a later validator proves a user-facing failure. Keep them separate from the bug queue.

- `frontend/public/sw.js` / PWA: offline mode, push opt-in, and offline fallback are not implemented.
- `frontend/components/VideoQuizOverlay.tsx`: video checkpoints are still a `return null` feature stub.
- `frontend/app/(dashboard)/exam-bank/page.tsx` / `backend/app/routers/courses.py`: Exam Bank advanced filtering remains shallow.
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
- CSP still allows inline style channels during migration.
- Math sets source port still contains visible placeholder interactive content.
- PII scrubbing/retention policy needs a broader pass for email dispatch, telemetry, and deleted users.
- Repository hygiene should explicitly decide how to handle generated artifacts and whether local untracked/ignored artifacts should be reported during agent audits.

## Archive

Resolved, stale, duplicate, and corrected legacy findings were moved to
`AGENT_BUG_DUMP_ARCHIVE.md` to keep this file agent-friendly.

Do not load the archive during normal bug-fix passes. Open it only when tracing
why an old dump finding is absent from the active queue. The exact raw pre-rewrite
dump is preserved in git history at `cee76e2^:AGENT_BUG_DUMP.md`.
