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
- Alembic head is `0048`.
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
- Current active bug count after this deep audit append: 53.
- A keyword coverage pass checked the old unresolved topic families against this file before staging.

## Active Queue

### P0 - Release Blockers

#### BUG-P0-007 - Production launch gate remains below release threshold

Status: OPEN

Files: `scripts/check_production_launch_gate.py`, `PRODUCTION-SWITCH.md`, `docs/production-remediation-traceability.md`, `.github/workflows/deploy-backend.yml`, `.github/workflows/deploy-frontend.yml`

Current evidence: `python scripts/check_production_launch_gate.py --json` fails with current score 5.5 / target 9.0. The gate reports 12 unverified traceability rows: `SEC-CSP-STYLE-001`, `SEC-SECRETS-001`, `MEDIA-S3-001`, `MEDIA-AUTH-001`, `RT-FANOUT-001`, `RT-OUTBOX-001`, `PERF-TOPIC-001`, `FE-DEMO-001`, `OPS-STAGE-001`, `OPS-RDS-001`, `OPS-LAMBDA-001`, and `OPS-RUNBOOK-001`. Production deploy workflows enforce the gate.

Risk: release readiness can be claimed while required security, media, realtime, performance, frontend demo, and ops evidence is missing or stale.

Fix direction: verify or retire each traceability row with current commands/evidence and keep the launch gate failing until the score reaches the target.

### P1 - Correctness, Security, and Scalability Bugs

#### BUG-P1-047 - Global PRO users are denied all realtime live session subscriptions

Status: OPEN

Files: `backend/app/services/realtime_access.py`

Current evidence: `live_session_ids_for_user` and `offering_ids_for_user` both short-circuit and return `[]` if `not access_context.subject_scope_enforced`. Global PRO users (who just have `is_pro = True` without specific `UserSubjectEntitlement` rows) have `subject_scope_enforced = False` because they have global access. This means PRO users are granted zero live sessions and zero offering channels in their Ably tokens.

Risk: Users who pay for a global PRO tier upgrade are completely locked out of live session chats and stream realtime updates because their Ably tokens lack the necessary subscription capabilities.

Fix direction: Remove the `if not access_context.subject_scope_enforced: return []` check, and conditionally omit the `CourseOffering.subject_id.in_(access_context.active_subject_ids)` filter if `subject_scope_enforced` is false.

#### BUG-P1-046 - Student live sessions ignore program track deactivation

Status: OPEN

Files: `backend/app/services/professor_queries.py`

Current evidence: `require_student_live_session` and `student_live_sessions` filter sessions by `ProgramTrack.niveau == student.niveau` and `ProgramTrack.filiere == student.filiere`, but they lack the `ProgramTrack.status == "active"` check found in other course scopes (e.g., `student_offerings`).

Risk: Students can access live sessions, chat, and stream credentials for program tracks that have been deactivated or deprecated.

Fix direction: Add `ProgramTrack.status == "active"` to the filtering predicates for student live sessions to enforce strict track activation boundaries.

#### BUG-P1-042 - Notification pagination window function forces table scans
Status: OPEN
Files: `backend/app/services/notifications.py`
Current evidence: `list_user_notifications` uses `func.sum(case(...)).over()` to calculate `unread_count_expr` without a partition, inside a paginated query with `.offset().limit()`. In SQL, a window function without a partition over the entire result set forces the database to evaluate the window over all matching rows before applying `LIMIT`.
Risk: Fetching 20 notifications for a user with 10,000 notifications requires a full index scan and materialization of all 10,000 rows just to compute the unread sum, defeating Top-N index optimizations and causing a severe N+1-like pagination bottleneck.
Fix direction: Remove the `.over()` window function from the paginated read query. Execute a separate targeted `COUNT` query for unread notifications (which can use partial indexes) and let the main query use the `(user_id, created_at)` index for O(1) Top-N pagination.

#### BUG-P1-043 - Payment checkout API drops frontend success and cancel redirect paths
Status: OPEN
Files: `backend/app/routers/payments.py`, `backend/app/services/stripe_service.py`, `frontend/lib/payments.ts`
Current evidence: The frontend `createProCheckoutSession` in `frontend/lib/payments.ts` posts to `/payments/create-checkout-session` using `apiClient.post` but passes `plan` as a query parameter (`{ params: { plan: PRO_CHECKOUT_PLAN } }`). Even if the frontend were to pass `{ success_path, cancel_path }` in the POST body to return the user to the course they were viewing, the backend `create_checkout` router does not declare a Pydantic body model to accept them. Consequently, `create_checkout_session` in `stripe_service.py` uses hardcoded URLs (`payment-success?session_id=...` and `pricing`), completely dropping the frontend's intent for where to return the user after checkout.
Risk: Product checkout flows break UX expectations because they cannot preserve the user's intent to return to a specific locked course/topic page after successfully paying or canceling.
Fix direction: Update the backend router to accept a Pydantic JSON body model containing `plan`, `success_path`, and `cancel_path`. Plumb these paths down to `create_checkout_session`, validate them as safe relative URLs, and build the Stripe `success_url` and `cancel_url` from them rather than hardcoding static fallback endpoints.

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

#### BUG-P2-015: User interaction saves and comments lack DELETE endpoints

Status: DISCOVERY

Files: `backend/app/routers/interactions.py`, `backend/app/services/interaction_mutations.py`

Current Evidence: The interactions router exposes endpoints to create comments (`POST /comments`), create saves (`POST /saves`), and update/delete notes. However, it lacks `DELETE /saves/{save_id}` and `DELETE /comments/{comment_id}` endpoints, nor does the underlying `interaction_mutations.py` implement them. Saves are uniquely constrained and use `on_conflict` fallback, but no unsave action exists.

Risk: Data Integrity / Usability - Users cannot unsave items or delete their own comments, leading to an irrevocably cluttered "Saved" list over time.

Fix direction: Implement and expose `delete_save` and `delete_topic_item_comment` mutations that verify ownership (e.g., `user_id == user.id`) before dropping the rows.

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

#### BUG-P1-044 - Payment verification race condition returns unpaid status for concurrent requests

Status: OPEN

Files: `backend/app/services/payment_lifecycle.py`

Current evidence: `verify_checkout_session_state` uses `record_payment_verification_attempt_once` to deduplicate concurrent requests. It returns `first_attempt=False` for concurrent requests and immediately reads `is_pro=bool(user.is_pro)`. It does not wait for the first request to finish calling Stripe and committing `user.is_pro = True`.

Risk: A concurrent verification request can return an unpaid status (`is_pro=False`) back to the frontend while the first request is still successfully validating the checkout in the background.

Fix direction: Add an async lock/wait for the in-progress verification to finish, return an HTTP 202/409 for concurrent requests, or rely entirely on the Stripe webhook for fulfillment.

#### BUG-P1-045 - Daily quest progress is silently lost if quests are not generated before earning XP

Status: OPEN

Files: `backend/app/services/xp.py`, `backend/app/services/gamification_read_models.py`

Current evidence: `award_xp` and `award_xp_bulk` update daily quest progress by executing an `UPDATE daily_quests SET progress = progress + X` query without first ensuring the user's daily quests have been generated for today. `generate_daily_quests_with_status` is only called by read routes (e.g., `sidebar-summary` or `daily-quests`).

Risk: If a user completes a lesson or quiz and earns XP before visiting a page that fetches quests (e.g., via a direct deep-link or stalled sidebar), the `UPDATE` query affects zero rows. The XP is awarded but the quest progress is silently dropped. When the user later opens the sidebar, their quests are generated with 0 progress.

Fix direction: Call `generate_daily_quests` inside `award_xp` before applying progress updates, or change the daily quest generator to compute progress retroactively from today's `XPTransaction` rows when creating new quests.

### P2 - User-Visible Flow Bugs

#### BUG-P2-016 - VdoCipher live streams are orphaned if database transaction fails post-creation

Status: OPEN

Files: `backend/app/services/professor_live_sessions.py`

Current evidence: `create_professor_live_session` calls the external `create_live_stream` API if `vdocipher_live_id` is empty, then proceeds to do `db.add(session)`, insert a `CalendarEvent`, flush the database, insert `Notification` rows, and enqueue realtime events before `db.commit()`. If any database constraint fails or exception occurs after the API call, the session is rolled back, leaving the external VdoCipher live stream orphaned.

Risk: External resources are leaked, accruing quota and costs without a corresponding local record for the admin to track or clean up.

Fix direction: Wrap the creation in a compensation block that deletes the VdoCipher stream on rollback, or create a pending local record first that is then reconciled with a background job if it fails to finalize.

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
#### BUG-P2-013 - Logout invalidates pending email verification or password reset links

Status: OPEN

Files: `backend/app/services/auth_account.py`, `backend/app/routers/users.py`

Current evidence: `revoke_user_sessions` unconditionally increments `user.auth_token_version`: `user.auth_token_version = (user.auth_token_version or 0) + 1`. Meanwhile, `verify_email_account` and `reset_password_account` enforce that the token's embedded version exactly matches `user.auth_token_version`. Consequently, if a logged-in user requests a password reset and then logs out, or if an unverified user logs out (or their session is revoked), their pending verification/reset token immediately becomes invalid.

Risk: UX is degraded because normal auth actions destructively interfere with out-of-band email recovery links, leading to "invalid or expired token" errors.

Fix direction: Introduce separate token versions (e.g., `session_token_version` for auth and `recovery_token_version` for email flows), or encode a standalone nonce for recovery flows.

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

## Backend Correctness Audit - 2026-06-02

- [ ] **[HIGH]** `backend/app/services/professor_chat_mutations.py:331-364` - Stale/Divergent Unread Count on Chat Message Deletions
- [ ] **[HIGH]** `backend/app/services/course_progress.py:102-169` - Concurrency TOCTOU Race Condition & HTTP 500 Crash on First-Time Quiz Submissions
- [ ] **[HIGH]** `backend/app/models/gamification.py:150` - Missing Foreign Key Cascade on TopicItemProgress.topic_item_id
- [ ] **[HIGH]** `backend/app/services/auth_email_dispatch.py:56-111` - Unhandled Concurrency Crash and IntegrityError in Email Dispatch Throttling
- [ ] **[HIGH]** `frontend/vitest.config.ts` & `frontend/tests/topicWorkspaceQuizTab.test.tsx` - Vitest Coverage Deleted Instead of Migrated (Silently Ignored `.tsx` Files)
- [ ] **[MEDIUM]** `backend/app/services/xp.py:15-26` / `backend/app/services/course_tab_quiz_submission.py:318-348` - Missing Gamification XP Rewards for Quiz Retries and Perfect Scores
- [ ] **[MEDIUM]** `backend/app/services/quiz_grading.py:36-71` - Drag and Drop Question Type Grading Normalization Mismatch

#### BUG-P2-017 - Professor live session 'notify' endpoint allows unbounded notification spam

Status: OPEN

Files: `backend/app/services/professor_live_sessions.py`, `backend/app/models/notifications.py`

Current evidence: `notify_professor_live_session` calls `notify_students_for_live`, which issues an unguarded `INSERT ... SELECT` into the `notifications` table for every student in the track. There is no deduplication or idempotency key to prevent creating identical notifications for the same live session.

Risk: A professor repeatedly clicking the "Notify" button (intentionally or by accident) will spam duplicate "Upcoming live session" notifications to every active student in the offering.

Fix direction: Add an idempotency key or a unique constraint on `(user_id, source_id, type)` for notifications, or query for existing unread live session notifications before inserting new ones.

#### BUG-P2-014 - User gamification streak days are never incremented

Status: OPEN

Files: `backend/app/services/xp.py`, `backend/app/models/gamification.py`, `backend/app/services/gamification_read_models.py`

Current evidence: Gamification models include `UserXP.streak_days`, a sidebar widget renders `strike_days`, and the XP service lists `streak_bonus` in `XP_REWARDS`. However, there is no mutation path or cron job that ever increments a user's `streak_days`. New users start with `streak_days=0` and remain at 0 indefinitely. A `daily_login` reward is defined but never invoked anywhere in the codebase.

Risk: The gamification streak UI will always show an empty/broken streak, and users will never receive the advertised streak bonuses, causing frustration and distrust in the progress system.

Fix direction: Implement a daily streak calculation hook (e.g. on first authenticated request of a new UTC day or via an async cron), award `daily_login` XP, update `streak_days`, and handle streak breaks.

### Detailed Findings

#### 1. [HIGH] Stale/Divergent Unread Count on Chat Message Deletions
* **Severity:** HIGH
* **File/Line:** `backend/app/services/professor_chat_mutations.py` line 331 (in `delete_chat_message_state`)
* **Summary:** When a student or professor deletes a message (permitted within the 15-minute edit/delete window), the message is deleted from the database and the conversation's `last_message_preview` is correctly refreshed. However, the conversation's unread counters (`unread_for_student` and `unread_for_professor`) are completely ignored and never adjusted. As a result, deleting an unread message leaves the recipient with a stale, out-of-sync unread badge (e.g. indicating they have unread messages when the conversation is completely empty), corrupting the messaging status metrics.
* **Reproduction Path:**
  1. Student sends a message to a professor. The conversation's `unread_for_professor` increments to 1.
  2. Student immediately deletes the message (within the 15-minute edit window) via `DELETE /api/professor/chat/messages/{message_id}` (or through the student endpoint).
  3. The `unread_for_professor` counter in the database remains at 1, even though the message has been deleted.
  4. The professor's dashboard and sidebar will continue to show "1 unread message", but opening the conversation will show zero messages.
* **Expected Behavior:** When a message is deleted, if the message was not yet read by the recipient (i.e. its creation was responsible for incrementing the counter), the unread counter for the recipient is decremented.
* **Actual Behavior:** The unread counter is never adjusted, causing persistent stale unread notifications for deleted messages.
* **Proof from Code:** Look at `delete_chat_message_state` (lines 331-364):
  ```python
  async def delete_chat_message_state(
      db: AsyncSession,
      *,
      user: User,
      message_id: int,
      request: Request,
      require_professor_active_offering_fn: RequireProfessorActiveOfferingFn,
  ) -> dict[str, bool]:
      message, conversation = await require_owned_chat_message(db, user, message_id)
      # ...
      await db.delete(message)
      await db.flush()
      await refresh_chat_preview(db, conversation)
      # ...
      await db.commit()
      return {"ok": True}
  ```
  The function deletes the message and calls `refresh_chat_preview` (which only re-evaluates `last_message_preview` and `last_message_at`), but completely omits checking whether the deleted message was unread and decrementing `unread_for_professor` or `unread_for_student`.
* **Why this is not a duplicate:** This is a newly discovered bug. Existing chat-deletion findings (e.g., in Round 2 and Round 6) only dealt with missing authorization checks and missing 15-minute edit windows in the deletion path, whereas this refers to the data-integrity desynchronization of the unread counters.
* **Suggested fix direction:** In `delete_chat_message_state`, check if the message being deleted has `read_at` as `None` or was created since the last read time. If the message was sent by the student and is unread, decrement `conversation.unread_for_professor` (ensuring it does not go below 0). If it was sent by the professor and is unread, decrement `conversation.unread_for_student` (ensuring it does not go below 0).

#### 2. [HIGH] Concurrency TOCTOU Race Condition & HTTP 500 Crash on First-Time Quiz Submissions
* **Severity:** HIGH
* **File/Line:** `backend/app/services/course_progress.py` lines 102-169 (`ensure_question_set_for_tab`)
* **Summary:** First-time submissions for a quiz tab call `.scalar_one_or_none()` to check if a `QuestionSet` exists. Since there is no unique constraint on `tab_content_id` in the `question_sets` table, concurrent requests (from double-clicks or multiple concurrent student attempts) can execute this check in parallel, see `None`, and successfully commit duplicate `QuestionSet` rows. Subsequent attempts to load or submit that quiz call `scalar_one_or_none()`, which throws a `sqlalchemy.orm.exc.MultipleResultsFound` exception and crashes the app with an HTTP 500 error, permanently locking out all students.
* **Reproduction Path:**
  1. A student opens a quiz tab for the first time.
  2. Double-clicking the submission button or making rapid concurrent submissions results in multiple API calls invoking `submit_tab_quiz_attempt` in parallel.
  3. Both concurrent requests check `ensure_question_set_for_tab`, see that no `QuestionSet` exists for this tab ID, create a new one, and flush/commit.
  4. Two `QuestionSet` records are created for the same `tab_content_id` in the database.
  5. Any subsequent attempts to access the quiz tab or submit answers execute `ensure_question_set_for_tab`, where `.scalar_one_or_none()` raises `MultipleResultsFound`, resulting in a perpetual HTTP 500 crash for this quiz.
* **Expected Behavior:** Concurrent requests are safely serialized or handled via database constraints so that at most one `QuestionSet` can ever be created for a given `tab_content_id`.
* **Actual Behavior:** Multiple `QuestionSet` rows are created, causing future queries to raise `MultipleResultsFound` and permanently crashing the quiz.
* **Proof from Code:** Look at `ensure_question_set_for_tab` (lines 109-130):
  ```python
  result = await db.execute(
      select(QuestionSet)
      .options(selectinload(QuestionSet.questions))
      .where(QuestionSet.tab_content_id == tab.id)
  )
  question_set = result.scalar_one_or_none()
  if question_set is None:
      question_set = QuestionSet(
          # ...
          tab_content_id=tab.id,
          # ...
      )
      db.add(question_set)
      await db.flush()
  ```
  Since no unique constraint exists on `tab_content_id` in the `QuestionSet` database table or ORM model, the concurrent inserts both succeed, breaking the invariant required by `scalar_one_or_none()`.
* **Why this is not a duplicate:** Unique and newly cataloged concurrency race condition. Previous quiz audits only highlighted course-authoring gaps but missed database race conditions on runtime creation of dynamic content blocks.
* **Suggested fix direction:** Add a unique index/constraint on `tab_content_id` in the `question_sets` table via a new Alembic migration. Wrap the creation block in `ensure_question_set_for_tab` in a try-except catching `IntegrityError`, rolling back, and re-selecting the successfully committed row.

#### 3. [HIGH] Missing Foreign Key Cascade on TopicItemProgress.topic_item_id
* **Severity:** HIGH
* **File/Line:** `backend/app/models/gamification.py` line 150
* **Summary:** The `TopicItemProgress` model defines `topic_item_id` as a raw `Integer` without an explicit `ForeignKey("topic_items.id", ondelete="CASCADE")` constraint. When a `TopicItem` is deleted, its related progress rows in `TopicItemProgress` are orphaned in the database. When the dashboard or sidebar tries to aggregate lesson progress joined by active topic items, these orphaned rows can cause severe query failures, mismatches in calculated percentages, or runtime exceptions.
* **Reproduction Path:**
  1. A student starts working on a topic item, creating a row in `topic_item_progress` with `topic_item_id = X`.
  2. An administrator deletes `TopicItem` with ID `X` (either via custom admin UI or directly).
  3. The `topic_item_progress` table still contains a row with `topic_item_id = X` pointing to a non-existent item.
  4. Queries compiling student curriculum progress or stats perform joins or count matches, resulting in incorrect completion percentages or crashes due to referential integrity violations.
* **Expected Behavior:** When a `TopicItem` is deleted, all dependent progress records are automatically deleted from the database via a cascading constraint.
* **Actual Behavior:** Dependent progress records remain in the database as orphaned rows with invalid `topic_item_id` values.
* **Proof from Code:** In `backend/app/models/gamification.py` (lines 136-160):
  ```python
  class TopicItemProgress(Base):
      __tablename__ = "topic_item_progress"
      ...
      topic_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("topics.id", ondelete="CASCADE"), index=True)
      topic_item_id: Mapped[int] = mapped_column(Integer)
  ```
  While `topic_id` is defined with a proper cascading foreign key, `topic_item_id` is just a standard integer column.
* **Why this is not a duplicate:** Unique and distinct from previous foreign key audits. While Round 2 and Round 6 identified foreign key cascade gaps on other models (like `professor_user_id` and polymorphic `SavedItem`), they completely missed `TopicItemProgress.topic_item_id`.
* **Suggested fix direction:** Update `topic_item_id` to:
  `topic_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("topic_items.id", ondelete="CASCADE"), index=True)`
  and generate an Alembic migration to enforce the foreign key constraint.

#### 4. [HIGH] Unhandled Concurrency Crash and IntegrityError in Email Dispatch Throttling
* **Severity:** HIGH
* **File/Line:** `backend/app/services/auth_email_dispatch.py` line 56 (in `reserve_email_dispatch`) and lines 152, 170, 190.
* **Summary:** `reserve_email_dispatch` performs a select-then-add on `EmailDispatchThrottle` (which enforces a unique constraint on `(email, purpose)`). Because the row does not exist initially, the `.with_for_update()` lock does not lock any rows, allowing concurrent signup/reset requests for the same email to both proceed and attempt to add a new throttle record. When the calling dispatch functions (like `prepare_signup_verification_dispatch`) call `await db.commit()`, one request commits successfully, while the concurrent request raises a database-level `IntegrityError`. Lacking exception handling around these commits, the server crashes with an HTTP 500 error instead of gracefully returning a rate limit limit or rate-limiting response.
* **Reproduction Path:**
  1. A user rapidly double-clicks the "Send Verification Email" button on signup or forgot password.
  2. Both concurrent requests call `reserve_email_dispatch` in parallel.
  3. Both see `throttle = None` because no throttle entry exists yet.
  4. Both add a new `EmailDispatchThrottle` row for the same email and purpose.
  5. Both return reservations and call `await db.commit()`.
  6. The second commit fails with `IntegrityError: (psycopg2.errors.UniqueViolation) duplicate key value violates unique constraint` and crashes the request with a 500 Internal Server Error.
* **Expected Behavior:** Concurrent request collisions are gracefully intercepted and treated as throttling limits (returning a controlled HTTP 429 or rate-limit outcome), preventing HTTP 500 crashes.
* **Actual Behavior:** An unhandled database `IntegrityError` is raised on commit, crashing the request and returning an HTTP 500 error to the client.
* **Proof from Code:** In `backend/app/services/auth_email_dispatch.py` (lines 56-84):
  ```python
  async def reserve_email_dispatch(db: AsyncSession, email: str, purpose: str) -> EmailDispatchReservation | None:
      # ...
      result = await db.execute(
          select(EmailDispatchThrottle)
          .where(EmailDispatchThrottle.email == email, EmailDispatchThrottle.purpose == purpose)
          .with_for_update()
      )
      throttle = result.scalar_one_or_none()
      if throttle is None:
          throttle = EmailDispatchThrottle(
              email=email,
              purpose=purpose,
              # ...
          )
          db.add(throttle)
      # ...
  ```
  Since `with_for_update` only locks *existing* rows, concurrent requests find no row and both insert, leading to flush-time unique constraint violations.
* **Why this is not a duplicate:** Unique and newly discovered concurrency rate-limiting crash. Previous rate-limiting findings in Round 6 focused on IP-spoofing and SlowAPI Limiter configurations but did not inspect the transaction commit boundaries of backend-driven email throttling.
* **Suggested fix direction:** Wrap the add or flush operation inside `reserve_email_dispatch` with a nested transaction block (`async with db.begin_nested():`) to intercept the `IntegrityError` at reservation time, or wrap the calling `db.commit()` in a try-except block to catch `IntegrityError` and return `None` (graceful rate limit response).

#### 5. [HIGH] Vitest Coverage Deleted Instead of Migrated (Silently Ignored `.tsx` Files)
* **Severity:** HIGH
* **File/Workflow/Test:** `frontend/vitest.config.ts` and `frontend/tests/topicWorkspaceQuizTab.test.tsx`
* **What it claims to verify:** The frontend unit test CI step claims to run all test coverage to verify that UI components and their respective tests successfully pass.
* **Why it does not actually verify it:** The `vitest.config.ts` explicitly scopes test execution by setting `include: ['tests/**/*.test.ts']`. This regex silently excludes `.tsx` test files (which typically contain React component tests and heavy UI coverage). As a result, critical tests like `topicWorkspaceQuizTab.test.tsx` (which asserts complex learner loop UI behaviors like retry, submit, and error handling) are completely skipped and ignored by the test runner.
* **Failure that could escape:** An architectural or styling change breaking the core React quiz components (like the `TabPanel` or answer inputs) would deploy straight to production because its accompanying assertions in `.tsx` files are never executed.
* **Proof from code/config:** In `frontend/vitest.config.ts`, `include` uses the glob `tests/**/*.test.ts`. But `frontend/tests/topicWorkspaceQuizTab.test.tsx` has the `.tsx` extension, meaning `npm run test:coverage` skips it entirely while still reporting 100% of discovered tests as passing.
* **Why this is not a duplicate:** Pinpoints a classic coverage exclusion error specifically affecting the vitest test suite for UI components.
* **Proposed concrete test or gate:** Update `include` in `vitest.config.ts` to `['tests/**/*.test.ts', 'tests/**/*.test.tsx']` or `['tests/**/*.test.{ts,tsx}']` to ensure React tests are actually run.

#### 6. [MEDIUM] Missing Gamification XP Rewards for Quiz Retries and Perfect Scores
* **Severity:** MEDIUM
* **File/Line:** `backend/app/services/xp.py` lines 15-26 and `backend/app/services/course_tab_quiz_submission.py` lines 318-348
* **Summary:** Although `XP_REWARDS` defines `quiz_retry_correct` (3 XP) and `quiz_perfect` (15 XP), they are completely missing from the gamification logic. When retrying a quiz, the system attempts to award the full `quiz_correct` (5 XP) for any correct answer using the idempotency key `f"quiz_correct:user:{user.id}:question:{question_id}"`. If a student already got that question correct on a previous attempt, the transaction is rejected by the database unique constraint (`ix_xp_transactions_user_idempotency`), yielding **exactly 0 XP** instead of the intended 3 XP retry reward. Additionally, perfect quiz score bonuses (`quiz_perfect` = 15 XP) are never evaluated or awarded even if a student gets 100%.
* **Reproduction Path:**
  1. Student takes a quiz tab and gets question A correct, earning 5 XP (idempotency key `quiz_correct:user:1:question:A` persisted).
  2. Student retakes the quiz and gets question A correct again.
  3. The submission handler attempts to award `quiz_correct` with the same idempotency key `quiz_correct:user:1:question:A`.
  4. The unique constraint `ix_xp_transactions_user_idempotency` ignores the duplicate transaction, resulting in 0 XP earned for this retry instead of the expected 3 XP.
  5. If the student answers all questions correctly (100%), they receive no `quiz_perfect` bonus (15 XP).
* **Expected Behavior:** When answering a question correct on a retry, the system awards `quiz_retry_correct` (3 XP). When achieving a 100% score on a quiz, the system awards `quiz_perfect` (15 XP).
* **Actual Behavior:** Neither `quiz_retry_correct` nor `quiz_perfect` is ever referenced in any XP awarding or scoring logic outside the static `XP_REWARDS` dictionary.
* **Why this is not a duplicate:** This is a newly discovered bug in the XP/gamification service implementation. The legacy quiz attempt findings in Round 6 only highlighted structural schema design and zero XP defaults on legacy models, but did not discover that `quiz_retry_correct` is completely unused, nor that `quiz_perfect` is dead code.
* **Suggested fix direction:** Update `submit_tab_quiz_attempt` to check if a question was already answered correctly in previous attempts (by querying `QuestionAttempt` records for the user). If so, award `quiz_retry_correct` with an idempotency key tied to the current `quiz_attempt_id` (e.g., `f"quiz_retry_correct:user:{user.id}:question:{question_id}:attempt:{attempt.id}"`). Also, check if `correct == total` (perfect score) and append a `quiz_perfect` award.

#### 7. [MEDIUM] Drag and Drop Question Type Grading Normalization Mismatch
* **Severity:** MEDIUM
* **File/Line:** `backend/app/services/quiz_grading.py` lines 36-71
* **Summary:** The `normalized_submission_value` function standardizes, casefolds, trims, and sorts key-value mappings for matching-type questions (which includes both `"matching"` and `"drag_and_drop"` types) to compute the submission hash correctly. However, the grading function `grade_quiz_question` omits the `"drag_and_drop"` type from the matching-style normalization block, falling through to strict un-normalized equality checks (`submitted == expected`). Any minor formatting variations in client submissions (e.g. whitespace, key order differences, or case mismatches) will cause a correct drag-and-drop response to be graded as **incorrect**, while the database records a signature corresponding to the normalized value, desynchronizing the grading state.
* **Reproduction Path:**
  1. A student submits a drag-and-drop question with response `{"Category A": "  Answer 1 ", "Category B": "Answer 2"}`.
  2. The expected response is `{"Category A": "Answer 1", "Category B": "Answer 2"}`.
  3. `normalized_submission_value` normalizes the response to `{"category a": "answer 1", "category b": "answer 2"}` and computes the submission hash.
  4. `grade_quiz_question` falls through to strict equality `submitted == expected` because `drag_and_drop` does not match `matching`.
  5. The comparison `{"Category A": "  Answer 1 ", "Category B": "Answer 2"} == {"Category A": "Answer 1", "Category B": "Answer 2"}` returns `False`, marking the correct response as incorrect.
* **Expected Behavior:** Both matching and drag-and-drop questions use normalized key-value comparisons during grading, matching the normalization applied during hash generation.
* **Actual Behavior:** `"drag_and_drop"` question types are graded with strict un-normalized equality, failing correct answers over minor formatting mismatches.
* **Why this is not a duplicate:** This is a newly discovered bug in the quiz grading service.
* **Suggested fix direction:** In `grade_quiz_question`, modify the `"matching"` block to also include `"drag_and_drop"`:
  `if question_type in {"matching", "drag_and_drop"}:`
