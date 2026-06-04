# Agent Bug Dump Archive

Last curated: 2026-06-04

This file keeps resolved, stale, duplicate, and corrected legacy findings out of
`AGENT_BUG_DUMP.md`. Agents should read the active queue first and open this file
only for provenance checks.

The exact raw pre-rewrite dump is preserved in git history:

```powershell
git show cee76e2^:AGENT_BUG_DUMP.md
```

## Resolved in Recent Commits

- `cde582c` - Fixed BUG-P1-001 by changing admin overview metric batches to reuse one read session per `_gather_reads` phase while preserving per-operation zero fallback and cancellation propagation, with a regression bounding full overview `_run_read` calls; validation: `python -m pytest tests_fastapi/test_admin_overview.py -q` and `python -m py_compile app/services/admin_overview.py`.
- `4ed6a65` - Fixed BUG-P1-043 by adding checkout JSON body support for `plan`, `success_path`, and `cancel_path`, validating safe relative return paths before Stripe URL creation, and sending those fields from the frontend payment helper; validation: `python -m pytest tests_fastapi/test_stripe_service.py tests_fastapi/test_payments.py -q`, `npm test -- --run tests/payments.test.ts`, and `python -m py_compile app/routers/payments.py app/services/payment_lifecycle.py app/services/stripe_service.py app/schemas/payments.py`.
- `dd3df69` - Fixed BUG-P1-042 by removing the notification unread-count window function from the paginated query and using a separate targeted unread `COUNT`; validation: `python -m pytest tests_fastapi/test_notifications.py -q` and `python -m py_compile app/services/notifications.py`.
- `a9711aa` - Fixed BUG-P1-046 and BUG-P1-040 by requiring active program tracks in student live-session list/embed lookups and pushing live-session feature plus subject-scope filters into SQL before pagination; validation: `python -m pytest tests_fastapi/test_professor_platform.py -q`, `python -m pytest tests_fastapi/test_professor_platform.py -q -k "inactive_program_tracks or inactive_course_offerings or filter_subject_scope_before_pagination or live_sessions_are_scoped"`, and `python -m py_compile app/services/professor_queries.py`.
- `fd0c2b3` - Fixed BUG-P1-047 by allowing global paid realtime access to omit the subject filter while preserving scoped subject filtering and unscoped basic fail-closed behavior; validation: `python -m pytest tests_fastapi/test_realtime.py -q`, `python -m pytest tests_fastapi/test_access_service.py -q`, and `python -m py_compile app/services/realtime_access.py app/services/access.py`.
- `3d8c524` - Fixed BUG-P0-004 by requiring `KRESCO_TEST_DATABASE_URL` in CI backend tests and making the FastAPI test fixture reset Postgres then run Alembic head before the app starts, while keeping the local SQLite metadata fallback because the current migration chain is not SQLite-compatible; validation: `python -m py_compile tests_fastapi/conftest.py`, `python -m pytest tests_fastapi/test_launch_gate.py -q`, and `python -m pytest tests_fastapi/test_api_docs_routing.py -q`.
- `bead3bf` - Fixed BUG-P0-003 by requiring `KRESCO_E2E_DATABASE_URL` in CI, wiring frontend CI/deploy integration tests to a Postgres service, and preparing the e2e database via Alembic before seeding; validation: `python -m py_compile scripts/prepare_e2e_db.py`, `python -m pytest tests_fastapi/test_launch_gate.py -q`, `npm test -- --run tests/playwrightIntegrationConfig.test.ts`, and the CI missing-URL guard.
- `04dffa9` - Fixed BUG-P0-002 by running Alembic against the target database before rendering/deploying the Lambda package and removing the old post-deploy Zappa migration invoke; validation: `python -m pytest tests_fastapi/test_staging_runtime_verifier.py -q` and `python -m pytest tests_fastapi/test_launch_gate.py -q`.
- `011896d` - Fixed BUG-P0-001 by removing leaderboard projection refresh/commit from `list_leaderboard_entries` and adding explicit internal and scheduled refresh entry points; validation: `python -m pytest tests_fastapi/test_gamification_routes.py -q` and `python -m pytest tests_fastapi/test_readiness.py -q -k diagnostics`.
- `8541ccb` - Fixed BUG-P0-008 by routing topic-item stream authorization through a primary-video resource access helper that requires a published resource and evaluates resource access as a child of the authorized topic item; validation: `python -m pytest tests_fastapi/test_course_access.py -q`, `python -m pytest tests_fastapi/test_course_interactions.py -q -k "resource_open or completion_stats or comment_access"`, and `python -m pytest tests_fastapi/test_topic_quiz.py -q -k "completion_rejects_spoofed_video"`.
- `f5bb0e0` - Fixed BUG-P0-006 by adding a leading `topic_item_id` index to `TopicItemProgress` model metadata plus Alembic migration `0048_topic_item_progress_topic_item_index.py`; validation: `python -m pytest tests_fastapi/test_query_plan_audit.py -q` and `python -m pytest tests_fastapi/test_data_integrity_audit.py -q`.
- `2df8e78` - Fixed BUG-P0-010 (renumbered from a reused active BUG-P0-009 entry) by flushing a newly created tab `QuestionSet` before constructing child `Question` rows with its id, preventing first-submit `questions.question_set_id` integrity failures; validation: `python -m pytest tests_fastapi/test_topic_quiz.py -q -k "grades_tracks_xp or question_set_and_attempt_number_race or attempt_history"` and `python -m pytest tests_fastapi/test_quiz_grading_service.py -q`.
- `4846af9` - Fixed BUG-P0-009 by making subject scoping depend on actual subject-entitlement rows rather than global paid tier alone, so legacy/global PRO users without subject rows keep global course access while subject-scoped users remain constrained; validation: `python -m pytest tests_fastapi/test_access_service.py -q`, `python -m pytest tests_fastapi/test_course_access.py -q`, and `python -m pytest tests_fastapi/test_realtime.py -q -k "subject_scope or filters_subject_scope or omits_offering_notifications"`.
- `5a01ffa` - Fixed BUG-P2-002 by adding a request-generation guard to the full leaderboard page so stale search/page responses cannot overwrite newer results, with a regression for slow search resolving after a newer search; validation: `npm test -- --run tests/leaderboardRender.test.ts`, `npm run typecheck`, and `git diff --check`.
- `c9463ca` - Fixed BUG-P2-001 by removing the leaderboard page fallback that treated the first visible row as the current user and adding a regression for non-empty results without an `is_current_user` row; validation: `npm test -- --run tests/leaderboardRender.test.ts`, `npm run typecheck`, and `git diff --check`.
- `e3a1947` - Fixed BUG-P1-022 by parsing exponent chains iteratively while preserving right associativity and adding Zed math regression tests; validation: `npm test -- --run tests/zedMath.test.ts`, `npm run typecheck`, and `git diff --check`.
- `cb6edf0` - Fixed BUG-P1-011 by reconciling recipient unread counters when sender-owned unread chat messages are deleted, with professor and student counter regressions; validation: `python -m pytest tests_fastapi/test_professor_platform.py -q -k "deleting_unread or professor_chat_message_reads_skip_commit_when_unread_counts_are_zero or professor_chat_messages_are_cursor_paginated"` and `git diff --check`.
- `f9536c1` - Fixed BUG-P1-014 by keeping user-initiated logout pending until `/api/auth/logout` succeeds, preserving local session state on revocation failure, adding a separate local clear path for invalid AuthGuard sessions, and delaying nav redirects until logout succeeds; validation: `npm test -- --run tests/authSession.test.ts tests/authGuardComponent.test.ts`, `npm run typecheck`, and `git diff --check`.
- `beaef01` - Fixed BUG-P1-005 by making `find_n1.py` fail on unapproved findings, preserving a current baseline, adding focused scanner tests, and wiring `python find_n1.py app` into backend CI; validation: `python find_n1.py app`, `python find_n1.py --no-baseline app`, `python -m pytest tests_fastapi/test_find_n1_script.py -q`, and `git diff --check`.
- `03bd8fa` - Fixed BUG-P0-005 by adding a protected `/onboarding` route and making `AuthGuard` redirect server-verified incomplete students there before rendering protected student routes; validation: `npm test -- --run tests/authGuardComponent.test.ts tests/authSession.test.ts tests/proxy.test.ts tests/authPageController.test.ts`, `npm run typecheck`, and `git diff --check`.
- `dbd011c` - Fixed BUG-P1-026 by preventing locked topic-workspace tab previews from falling back to protected `tab.content` or protected resource summaries; validation: `npm test -- --run tests/topicWorkspacePanels.test.ts` and `npm test -- --run tests/topicWorkspacePanels.test.ts tests/topicWorkspacePage.test.ts tests/topicWorkspaceViewModel.test.ts tests/topicWorkspaceResources.test.ts`.
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

## Stale, Duplicate, or Corrected Findings

- The old dump corruption finding is resolved by the current split: the active dump is now a clean, searchable Markdown queue.
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
- BUG-P1-012 is stale as written: tab quiz answers are bounded by `validate_quiz_answers_payload`, professor change-request JSON is bounded by `validate_bounded_json_object`, and `backend/tests_fastapi/test_schema_limits.py` covers both structural limits.
- The active `BUG-P0-005` logout revocation record was a duplicate of the issue fixed by `f9536c1` and archived as BUG-P1-014.
- `BUG-P2-005` was moved out of the active queue: current auth intentionally separates professor and student workspaces, eligible non-professors already get a limited `Professor Chat` shortcut, and a true professor-to-student bridge requires product/session-model work rather than a local UI bug fix.
- `BUG-P2-006` is stale/false as a correctness bug: the admin page uses `AuthGuard requireStaff`, the backend overview route uses `get_current_staff_user`, both expose the same "Staff access required" boundary, and backend tests already cover student 403 versus staff 200.
- `BUG-P3-001` is stale/false as written: `AuthGuard` uses `verificationStateRef` to avoid repeat verification on the same mounted instance, and the focused auth guard tests cover one normal profile fetch plus intentional retry behavior.
- `BUG-P2-007` is confirmed performance debt rather than an active correctness bug: route diagnostics still show heavy first-load JS for core dashboard routes, but animated renderers are already dynamically loaded and no CI bundle budget currently fails. The item now lives in the active dump backlog section.

## Do Not Resurrect Without New Validation

- Duplicate recovered-finding blocks from the previous dump.
- Raw agent transcript sections, "round" headings, and unchecked duplicates from old audits.
- Items already listed in `AGENT_BUG_DUMP.md` Architecture and Product Backlog unless the next agent proves a concrete runtime failure.
