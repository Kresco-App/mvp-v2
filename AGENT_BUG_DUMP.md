# Agent Bug Dump

Last curated: 2026-06-04

This file is the active bug queue for Kresco. It is intentionally not the raw
agent transcript. Fixed, stale, duplicate, and false-positive findings live in
the archive at the bottom so the active queue stays actionable.

Status rules:

- `OPEN`: validated against the current worktree and still actionable.
- `VERIFY`: plausible but needs one more code/test pass before implementation.
- `FIXED` or `STALE`: keep only in `Historic Resolved and Stale Bugs`.

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

#### BUG-P0-005 - AuthGuard does not enforce student onboarding completion

Status: OPEN

Files: `frontend/components/AuthGuard.tsx`, `frontend/lib/authPolicy.ts`

Current evidence: `getStudentOnboardingStep` exists, but `AuthGuard` only checks role/staff through `hasRequiredAuthAccess` before rendering protected student routes.

Risk: a student with missing `niveau` or `filiere` can navigate directly to dashboard routes after server profile verification.

Fix direction: make `AuthGuard` redirect incomplete non-professor students to the onboarding flow unless the current route is the onboarding route itself.

### P1 - Correctness, Security, and Scalability Bugs

#### BUG-P1-001 - Admin overview opens too many concurrent DB reads

Status: OPEN

Files: `backend/app/services/admin_overview.py`

Current evidence: `_gather_reads` fans out many read operations with separate sessions, and the overview calls it repeatedly for counts, breakdowns, progress, live events, interactions, and notifications.

Risk: admin dashboard refreshes can exhaust the DB pool and amplify table-scan pressure.

Fix direction: reuse a bounded session/read transaction strategy and serialize heavy aggregates.

#### BUG-P1-002 - Quiz discovery still performs per-question-set access checks

Status: OPEN

Files: `backend/app/routers/quizzes.py`

Current evidence: `get_subject_quiz_discovery` loads up to 25 question sets, then calls `_question_set_access` inside a Python loop.

Risk: subject discovery remains O(N) in DB access checks.

Fix direction: batch the access predicates or prejoin the needed parent context.

#### BUG-P1-003 - Legacy quiz submit corrupts attempt analytics

Status: OPEN

Files: `backend/app/routers/quizzes.py`

Current evidence: `submit_quiz` inserts `QuizAttempt(attempt_number=1)` and returns `xp_earned=0` for every legacy quiz submission.

Risk: duplicate attempt numbers, no XP parity with tab quizzes, and analytics divergence.

Fix direction: route legacy submissions through the same attempt numbering, idempotency, grading, and XP service used by tab quizzes.

#### BUG-P1-004 - Professor dashboard unread aggregate remains request-time work

Status: OPEN

Files: `backend/app/services/professor_queries.py`

Current evidence: the dashboard still computes unread chat totals from conversation rows on demand.

Risk: per-request aggregate work grows with professor conversation count.

Fix direction: add an indexed/cached counter or a partial aggregate path with tests for unread correctness.

#### BUG-P1-005 - Course read-model N+1 guardrail remains incomplete

Status: OPEN

Files: `backend/app/services/course_topic_read_models.py`, `backend/find_n1.py`

Current evidence: the current N+1 scanner still reports candidates and is not a CI-enforced guardrail.

Risk: topic workspace and course-read endpoints can regress into looped DB access without failing CI.

Fix direction: fix real candidates, make `find_n1.py` fail on findings, and add it to backend CI.

#### BUG-P1-006 - Concurrent multi-tab watch XP can be farmed

Status: OPEN

Files: `backend/app/services/course_progress.py`, `backend/app/services/xp.py`

Current evidence: watch-second bounding is per topic item through item progress timing, not a global per-user watch-rate budget.

Risk: a student can earn parallel video/progress XP by watching multiple items in separate tabs.

Fix direction: add per-user wall-clock accrual limits or a watch-session ledger.

#### BUG-P1-007 - XP idempotency and timezone state still have exploit edges

Status: OPEN

Files: `backend/app/services/xp.py`

Current evidence: XP day boundaries use UTC-only daily logic, and actions without explicit idempotency keys can still rely on weak duplicate protection.

Risk: timezone edge gaming and duplicate XP insertion under concurrent actions.

Fix direction: make daily reward policy explicit per user locale/account timezone and require non-null idempotency keys for awardable actions.

#### BUG-P1-009 - Polymorphic references can orphan saved/change-request targets

Status: OPEN

Files: `backend/app/models/interactions.py`, `backend/app/models/professor.py`

Current evidence: `SavedItem` and `ProfessorChangeRequest` use `target_type`/`target_id` without DB-level referential integrity.

Risk: deleting topics, resources, questions, or exam problems can leave records that later render broken UI or 404 metadata.

Fix direction: introduce typed nullable FKs where possible or add cleanup/validation jobs with enforced target resolvers.

#### BUG-P1-010 - Realtime outbox has no retention cleanup

Status: OPEN

Files: `backend/app/services/realtime_outbox.py`, `backend/app/models/professor.py`

Current evidence: published/dead events remain in the table indefinitely.

Risk: high-volume live/chat events bloat storage and slow outbox scans.

Fix direction: add a retention worker and migration/index support for purging old published/dead rows.

#### BUG-P1-011 - Deleted unread chat messages can leave ghost unread counts

Status: OPEN

Files: `backend/app/services/professor_chat_mutations.py`

Current evidence: delete refreshes preview but does not adjust `unread_for_professor` or `unread_for_student` when deleting an unread message.

Risk: unread badges remain inflated until a read path resets them.

Fix direction: decrement the relevant unread counter when deleting an unread message, guarded by behavioral tests.

#### BUG-P1-012 - Arbitrary JSON request fields lack domain bounds

Status: OPEN

Files: `backend/app/schemas/courses.py`, `backend/app/schemas/professor.py`

Current evidence: quiz answers and change-request snapshots accept broad `dict[..., Any]` shapes.

Risk: deeply nested or unexpected JSON can persist into DB columns and break downstream renderers/auditors.

Fix direction: add schema/depth/size constraints per domain object, not only the global request body limit.

#### BUG-P1-013 - Local auth user data remains readable from localStorage

Status: OPEN

Files: `frontend/lib/authSession.ts`, `frontend/lib/store.ts`

Current evidence: `kresco_user` stores user profile context in localStorage.

Risk: PII/role/tier context is accessible to XSS, extensions, and physical access. The HttpOnly session model reduces auth-token exposure but not profile-data exposure.

Fix direction: minimize stored fields, move sensitive context to server verification, or use session-only memory where practical.

#### BUG-P1-014 - Logout can leave a server-backed zombie session

Status: OPEN

Files: `frontend/lib/store.ts`

Current evidence: `logout()` clears local auth state before the backend `/api/auth/logout` request succeeds.

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

#### BUG-P1-026 - Locked tab preview can expose protected tab content

Status: OPEN

Files: `frontend/components/topic-workspace/TopicWorkspacePanels.tsx`

Current evidence: locked tabs pass `summary={item.description || tab.content || tab.resource?.summary}` into `LockedContentPanel`.

Risk: if `item.description` is missing, the lock screen can render `tab.content`, which is the protected lesson body.

Fix direction: never use protected `tab.content` or protected resource summaries in locked previews; use only public item metadata and access reason.

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

## Historic Resolved and Stale Bugs

### Resolved in recent commits

- `e321ee1` - Profile save double-fetch false failure, admin retry/error states, payment-success retry affordance, AuthGuard server verification hardening, auth storage cross-tab sync, Topic Workspace mutation lock, Topic Workspace locked URL sync, Topic Workspace draft persistence, and VdoCipher player destroy cleanup.
- `1e6135d` - Save-item access bypass through inferred context, exam-bank parent subject publication filtering, quiz attempt-number/question-set creation races in tab quiz flow, quiz topic item completion, redundant course access context rebuilds, notification list/unread query path, async media URL offloading in async serializers, and VdoCipher DB-session release before provider calls.
- `bf396d5` - Auth/onboarding form bugs: email normalization, selected `niveau` hydration, filiere save validation, onboarding double-submit loading, and forgot-password fake-success state.
- `71196c5` - Course catalog URL/filter closure, exam-bank URL sync, leaderboard backend-search trust, sidebar streak alignment, and fake quest fallback removal.
- `5d32f52` - Payment verification stale profile refresh, payment lifecycle stale session state, and inconsistent `stripe_customer_id` persistence.
- `319836e` - Previous bug-dump fixed-item markings before this structural rewrite.
- `2907414`, `7adaf24`, `d1248cc` - Daily quest read-commit cleanup, quest claim locking, and progress-backed gamification stats.
- `21e6e1a`, `97f771c`, `b5e0656`, `38051e4` - Retry/timeout hardening for S3, Stripe, Resend, and VdoCipher provider calls.
- `110b0a6`, `fb4d762`, `f2cab9d`, `92fc9d0` - Calendar/professor realtime fallback stabilization and chat read/write churn reduction.
- `5fcc637`, `93b8fc1`, `62eaf5e` - Topic comment wrapping, video stream error surfacing, and TopicItemProgress FK/progress item constraints.
- `4eff95f` - Baseline validation commit after demo/scratch artifacts were stashed for later.

### Stale, duplicate, or corrected findings

- The old dump corruption finding is resolved by this rewrite: the file is now a clean, searchable Markdown queue.
- `frontend/vitest.config.ts` no longer excludes TSX tests; include is `tests/**/*.test.{ts,tsx}`.
- The broad synchronous `media_url` bulk-avatar finding is stale for current async app paths; app serializers call `async_media_url`.
- The S3 no-retry/no-timeout upload finding is stale after provider retry hardening.
- The old course write-endpoint rate-limit finding is stale: current `backend/app/routers/courses.py` has route-level limit decorators for subject/topic creation, topic completion, and resource-open tracking.
- The old missing-index findings for `LeaderboardRank.user_id`, `UserStats.user_id`, and `Notification.user_id` are stale: those fields are primary keys or indexed through current model metadata.
- The old telemetry executor finding is stale: telemetry now uses a dedicated bounded stdout executor with tests.
- The old Lambda `root_path="/production"` finding is stale: `create_app` keeps `root_path=""`, and routing tests cover stage-prefix stripping.
- The old `backend/alembic/versions/0000_local_baseline.py` catastrophic downgrade finding is resolved by the current migration behavior that refuses destructive downgrade instead of `drop_all`.
- The exam-bank parent `Subject.is_published` leak is fixed in current `backend/app/routers/courses.py`.
- The `ExamOut.statement_url` redaction claim should stay stale unless a new validator proves a current unauthorized response leak.
- The Next `proxy.ts` claim needs fresh runtime proof before reactivation; current tests and package version are built around `proxy.ts`.
- The old `diff_review.txt`/generated-artifact hygiene claims are stale for the current clean worktree; no tracked paths were found in the latest check.
- The old checkout/profile overwrite, payment customer mismatch, and payment stale-session lines are resolved by the payment commits above.
- The old Stripe verification DB-starvation claim is stale against the current payment lifecycle: idempotency is recorded before provider verification and payment state is refreshed/applied after the provider call.
- The old VdoCipher DB-starvation claim is fixed in current course/professor live paths; tests assert `await db.rollback()` occurs before provider calls.
- The old VdoCipher live/player memory leak is fixed by current `VideoPlayer` cleanup.
- The old Topic Workspace VdoCipher integration, quiz learner loop, notes list/edit/delete, resource actions, locked CTA, draft persistence, and locked URL lines are resolved by Round 9 and later frontend commits.
- The old Topic Workspace `primaryContent`/`topicQuery` memo churn finding is stale; current `primaryContent` deps no longer include `topicQuery`.
- The old Topic Workspace mutation-lock finding is resolved by `actionInFlightRef` and submit state around complete/save actions.
- The old permanent-sidebar orphan quest claim, fake quest, and streak alignment lines are resolved.
- The old profile media validation bypass, daily quest pessimistic lock, professor chat duplicate-conversation `IntegrityError` import, telemetry executor, migration downgrade, route root path, and request body cap lines were either fixed earlier or were stale against current code.
- The old notification list/unread sequential-query finding is resolved by the current notification service path and focused tests.
- The old `build_access_context` repeated-query finding for comment/save paths is resolved by passing validated context through the current access helpers.
- The old professor dashboard unread under-count finding is stale: current code sums `unread_for_professor`, while the remaining active issue is scalability of that aggregate.
- The old `frontend/lib/apiData.ts` 401 SWR cache trap is resolved: shared SWR config has `revalidateOnFocus: true`.
- The old auth/onboarding form findings are resolved: saved `niveau` hydration, filiere validation, double-submit loading, forgot-password error state, and email normalization all have focused tests.
- The old axios/AuthGuard global 401 conflict is mostly resolved for protected routes: `shouldRedirectOnUnauthorized` leaves protected/auth routes to AuthGuard. Public-page fallback redirect remains intentional.
- The old auth Double Navigation login race is stale against the current auth-controller tests and route-resolution flow.
- The old profile save double-fetch false-failure, admin retry/dead-end, admin topic-section retry cache, payment success retry, payment stale-profile, exam-bank URL sync, and leaderboard backend-search fallback findings are resolved by current focused tests.
- The old leaderboard pagination duplication, strict client search fallback, and half-error stale UI findings are stale against the current component because `lastNonEmptyEntries` and `instantEntries` were removed. Current active leaderboard bugs are listed separately.
- The old quiz tab question-set creation race, attempt-number race, quiz topic-item completion, and XP retry/perfect-score claim are resolved or stale against the current tab-quiz service and migration `0047`.

### Do not resurrect without new validation

- Duplicate recovered-finding blocks from the previous dump.
- Raw agent transcript sections, "round" headings, and unchecked duplicates from old audits.
- Items already listed in `Architecture and Product Backlog` unless the next agent proves a concrete runtime failure.
