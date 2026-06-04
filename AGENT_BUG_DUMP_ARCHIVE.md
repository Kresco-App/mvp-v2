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

## Do Not Resurrect Without New Validation

- Duplicate recovered-finding blocks from the previous dump.
- Raw agent transcript sections, "round" headings, and unchecked duplicates from old audits.
- Items already listed in `AGENT_BUG_DUMP.md` Architecture and Product Backlog unless the next agent proves a concrete runtime failure.
