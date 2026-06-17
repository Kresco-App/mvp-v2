# Production Hardening Control Ledger

Last updated: 2026-05-27

## Baseline

- Parent branch: `codex/production-hardening-final`
- Baseline HEAD: `23f1bbffcda0bfef0315681654bdf37b8c05ecb1`
- Baseline type: existing dirty worktree carried onto the hardening branch.
- Staging policy for this baseline: no application code is staged or committed by the baseline step.
- Development-only code and demo affordances may remain for now, but every such path must be easy to identify, gate, and remove before production release.

The worktree is intentionally not clean. This ledger records what is known now so each follow-up branch can make one traceable production-hardening change at a time.

## Current Gate Results

| Area | Command | Current Result | Notes |
| --- | --- | --- | --- |
| Backend unit/API tests | `cd backend; python -m pytest -q` | Green: `167 passed` | Broad FastAPI coverage is present, but several routers and edge cases remain untested. |
| Backend migrations | `cd backend; $env:DATABASE_URL='sqlite+aiosqlite:///:memory:'; alembic upgrade head` | Green | Local SQLite upgrade reaches `0020_auth_token_version`; Backend CI/deploy now also run Alembic against a Postgres service. No downgrade/round-trip gate yet. |
| Backend data integrity audit | `cd backend; python scripts/audit_data_integrity.py` | Green: no findings | Read-only duplicate audit covers near-term progress, save, daily quest, and XP idempotency targets; Backend CI/deploy run it after Postgres Alembic upgrade. |
| Frontend lint | `cd frontend; npm run lint` | Green | ESLint passes on the current dirty tree. |
| Frontend typecheck | `cd frontend; npm run typecheck` | Green | TypeScript passes. |
| Frontend unit tests | `cd frontend; npm run test` | Green: 21 files, 105 tests | Unit scope is broader, but fallback and API-contract tests still need expansion. |
| Frontend E2E | `cd frontend; npm run test:e2e` | Green: 6 Chromium tests | APIs are mocked/intercepted; this is not a real backend integration gate. |
| Frontend/backend integration E2E | `cd frontend; npm run test:e2e:integration` | Green: 1 Chromium test | Starts seeded local FastAPI plus Next, then validates browser -> Next rewrite -> FastAPI -> SQLite for demo login and courses. |
| Frontend production build | `cd frontend; npm run build` | Green | Next.js build succeeds and generates 28 static pages. |
| Secret ignore check | `git check-ignore -v backend/.env frontend/.env.local` | Green for ignore rules | Ignored local env files still exist and must not be printed, staged, or depended on. |
| Repo hygiene check | `python scripts/check_repo_hygiene.py` | Green | Gate is implemented and wired into CI/deploy. Working tree deletes tracked generated logs, OS files, Next traces, local SQLite files, `frontend/es-toolkit-1.46.1.tgz`, and `TODO-MANUAL.md`; manual operations now live under `docs/`. |

## Subagent Audit Lanes

Six scoped read-only audit agents were launched for baseline gathering. Their findings were used as evidence, not as final judgment.

| Lane | Scope | Status | Master Adjudication |
| --- | --- | --- | --- |
| Herschel | Production config, env, secrets, CORS, rewrites, CI/deploy, demo toggles | Complete | Real issues around local secrets, CORS test gaps, deploy env validation, frontend local/demo heuristics, and hard-coded rewrites. Stale database TLS concern was rejected after direct inspection. |
| Darwin | Auth, authorization, tiers, professor scope, realtime, Ably | Complete | Core auth/access/realtime posture is materially better than earlier context suggested. Remaining real gaps are professor active-assignment enforcement, audit logging, and professor-specific rate-limit tests. |
| Carson | Product docs vs implementation | Complete | Real product gaps remain in notes/saves deep links, activity tracking, XP wiring, and checklist-level content authoring assertions. |
| Noether | Backend test coverage map | Complete | Real coverage gaps remain for progress, user/auth edges, and service-level access/auth/xp behavior. |
| Leibniz | Frontend test coverage and mocked E2E audit | Complete | Real gap: Playwright proves hydration against synthetic responses, not live backend contracts. Guard, fallback, and API-shape tests remain thin. |
| Halley | Migrations, seed scripts, tracked artifacts, repo hygiene | Complete | Real high-risk gaps in seed-script safety and artifact hygiene. Migration baseline reproducibility risk is real but should be handled carefully because the repo already has deployed migration history. |

## Adjudicated Gaps

### P0: Local Secrets And Production Env Hygiene

Evidence:

- Ignored `backend/.env` exists in the workspace and contains live-looking secret keys. Values must never be printed or committed.
- `backend/app/config.py` still has a fallback JWT secret default.
- `backend/app/main.py` rejects the fallback JWT only in Lambda deployment mode.
- Deploy workflows now pin deploy-time CLIs and run stronger predeploy gates; backend deploy renders required Zappa production env values from GitHub secrets and fails before `zappa deploy` if required values are absent, and frontend deploy validates pulled Vercel production env before `vercel build`.
- `backend/zappa_settings.json` now declares the backend production env keys required by startup validation, removes local/ngrok CORS origins, sets an empty production CORS regex, and keeps optional `STRIPE_PK` optional; `backend/tests_fastapi/test_startup_security.py` validates the Zappa production environment shape and renderer against `Settings.production_config_errors()`.
- `VDOCIPHER_API_BASE_URL` is now explicit production config, and OTP requests no longer hardcode the VdoCipher API host inside service logic.

Required outcome:

- Keep backend and frontend production env validation green as deploy requirements evolve.
- Keep the repo hygiene gate green by removing tracked generated artifacts and local env files before merge.
- Add a secret hygiene checklist for manual provider/dashboard handling.
- Keep local development env paths usable, but isolate them behind explicit local-only rules.

### P0: Auth Token Lifecycle Is Hardened

Status:

- `backend/alembic/versions/0020_auth_token_version.py` adds `users.auth_token_version` and `users.password_changed_at`.
- New bearer JWTs include `token_version`; authenticated requests reject tokens whose version no longer matches the user row.
- Password reset tokens include the current auth token version, and successful reset increments the version and records `password_changed_at`.
- Reset-token replay and old-bearer-token reuse after password reset now have direct coverage in `backend/tests_fastapi/test_auth.py`.
- `backend/tests_fastapi/test_auth_service.py` directly covers token subject/version coercion, explicit version overrides, invalid token subjects/versions, malformed decoded JWT payload rejection, and reset-token lifecycle regressions.
- `create_token` and `decode_token` now reject bool, zero, negative, and non-integer user IDs plus invalid token versions instead of silently accepting ambiguous payloads.

Residual outcome:

- Secret-domain separation between JWT signing and email token signing remains coordinated with production env validation.
- Future auth-token format changes must preserve legacy token handling for versionless tokens until existing sessions naturally expire.

### P0: Destructive Seed Scripts Are Gated

Status:

- `backend/seed_local_full.py`, `backend/seed_professor_demo.py`, `backend/seed_burner_data.py`, and `backend/seed_kresco_v1.py` now require a local SQLite database plus `KRESCO_CONFIRM_DESTRUCTIVE_SEED` for CLI use.
- Code/test callers must pass `destructive_confirmed=True` explicitly.
- `backend/seed_mock_data.py` remains local-SQLite gated and skips when subject data already exists.
- `backend/tests_fastapi/test_seed_safety.py` and `backend/tests_fastapi/test_seed_local_full.py` prove nonlocal refusal and destructive-confirmation refusal.

Residual outcome:

- Keep future seed/demo scripts on `seed_safety.py`.
- Do not remove local demo paths until the production validation path replacing them exists.

### P1: First Real E2E Integration Lane Exists

Status:

- `frontend/tests/e2e/next16-smoke.spec.ts` remains a mocked rendering smoke suite.
- `frontend/playwright.integration.config.ts` starts a seeded local FastAPI backend and Next with local rewrites enabled.
- `frontend/tests/e2e/integration.spec.ts` proves local demo login and seeded course rendering through browser -> Next rewrite -> FastAPI -> SQLite.
- `frontend/package.json` exposes `npm run test:e2e:integration`, and Frontend CI plus Frontend deploy run it after build and mocked E2E.

Residual outcome:

- Expand integration coverage beyond one journey only after the remaining production policy gaps are closed.
- Keep mocked Playwright smoke tests because they are useful rendering coverage.

### P1: Professor Production Controls Are Enforced

Status:

- Professor role, active status, verified email, and active `CourseOffering` assignment are enforced before professor-area access.
- Professor password/Google/verify-email token issuance now refuses professor accounts without an active offering assignment.
- Rejected professor Google-login and verify-email flows now enforce active assignment before durable auth/profile mutations, so failed access does not silently verify email or attach Google profile fields.
- Owned offering/session/conversation checks remain at router layer.
- Professor-owned mutations now write `AdminAuditLog` entries tagged with `professor_user_id`.
- Professor sensitive mutation bursts are throttled per professor/path with backend tests.

Residual outcome:

- Keep adding audit assertions as new professor mutation endpoints are introduced.
- Revisit 2FA after MVP if professor access becomes broader than manually provisioned accounts.

### P1: Notes And Saves Context Improved; Activity And XP Are Partially Wired

Status:

- Notes and saved items now persist nullable `subject_id` through `0019_interaction_subject_context`.
- `/api/interactions/notes` infers subject/topic/item/tab context from submitted topic, item, or tab identifiers.
- `/api/interactions/saves` infers subject/topic/item context from topic items, resources, tab content, quiz/question context, exam problems, and legacy lesson/chapter/section targets.
- Quiz save context now resolves real legacy `Quiz -> Lesson -> Chapter` relationships before falling back to tab-based `QuestionSet` ids, preventing numeric ID collisions from attaching the wrong subject context.
- New saves write `saved_item_created` activity events; duplicate saves update missing context/label without duplicating the activity event.
- New notes write `note_created` activity events with subject/tab metadata.
- Daily quest generation now leaves rollback/commit ownership to callers, uses UTC-based dates by default, accepts explicit service dates for deterministic tests, and the API commits generated quest rows.
- XP awards with idempotency keys now insert through a nested transaction before mutating `UserXP`, so duplicate key races return `0` without corrupting the caller transaction.
- Legacy lesson progress, section completion, legacy lesson quiz submit, quiz-result recording, and daily quest claim now use stable XP idempotency keys.
- Video quiz result recording now requires submitted answer ids and uses shared backend scoring; client-supplied `score`/`passed` query values no longer decide pass state or XP.
- `backend/tests_fastapi/test_interactions.py` covers note context inference, save context inference, duplicate-save activity idempotency, resource-primary item restoration, legacy lesson/chapter/section context, legacy quiz/question-set collision handling, question-set fallback, and unknown quiz targets.
- `backend/tests_fastapi/test_gating.py` and `backend/tests_fastapi/test_xp_service.py` cover duplicate lesson completion XP, duplicate legacy lesson quiz pass/perfect XP, client-spoofed quiz score/pass rejection, and daily quest claim idempotency.

Residual evidence:

- Profile links still depend on the saved/note context supplied by the backend and should get one real profile restoration integration assertion.
- XP reasons such as retry-correct, exam-complete, daily-login, and streak-bonus are still defined more broadly than they are wired.
- Activity events are recorded for topic, quiz, note-create, and save-create flows, but not resource opens, notes edits, or exam-problem attempts.

Required outcome:

- Align saved/notes schema and links with documented restoration behavior.
- Wire or remove unused XP reason claims.
- Add activity events for documented behaviors.
- Add tests that prove user profile/activity views restore exact context.

### P1: Backend Coverage Has Router And Service Holes

Evidence:

- Good coverage exists for auth, profile, gating, quizzes, calendar, payments, realtime, professor platform, and admin overview.
- Notification helper transaction behavior and interactions context now have focused coverage.
- Realtime Ably token scoping now has a regression test proving subject filtering happens before the 100-session cap.
- VdoCipher OTP creation now has service coverage for configurable API base URL construction, URL-safe video ids, missing provider config, and provider error mapping.
- Locked legacy lesson stream, activities, PDFs, video quiz triggers, and section stream routes now share or enforce the same lesson/section access policy before returning protected payloads.
- XP daily quest service coverage now proves explicit date handling, quest progress updates for the chosen active date, no helper-level session rollback, route-level persistence of generated quests, and idempotent daily quest claim XP.
- Legacy lesson quiz submit and video quiz-result routes now share `backend/app/services/quiz_scoring.py`, reducing duplicated scoring logic and keeping answer evaluation server-side.
- `backend/app/services/data_integrity.py` and `backend/scripts/audit_data_integrity.py` add a read-only audit gate for duplicate lesson progress, content progress, saved-item targets, daily quests, and non-empty XP idempotency keys.
- `backend/tests_fastapi/test_access_service.py` now covers direct access-service invariants: subject scope overrides free preview, free preview still bypasses tier when subject scope allows it, parent subject locks are inherited, and legacy `is_pro` tier compatibility remains intact.
- Course resource/tab/item/section/exam-problem access projection and redaction moved from `backend/app/routers/courses.py` into `backend/app/services/course_access.py`, with direct tests proving locked payloads do not leak provider ids, URLs, tab configs, section payloads, or written solutions.
- Missing or thin direct coverage remains for course compatibility edge cases and uncovered XP/service behavior.
- Checkout creation and entitlement transitions now have direct router/service coverage for customer creation/reuse, one-time `pro` plan validation, missing config, metadata, return URL behavior, verify-session upgrades, webhook upgrades, and legacy defensive revocation.
- Professor chat VIP/Platinum eligibility and offering-track matching now live in `backend/app/services/professor_chat_access.py`, with focused policy tests plus professor-platform endpoint coverage.
- Billing copy/config now matches the backend's one-time hosted Checkout model: no subscription/cancel promise, no yearly overcharge path, and `STRIPE_PK` is optional compatibility config rather than required backend production config.

Required outcome:

- Add targeted tests before broad refactors.
- Prefer one router/service coverage file per follow-up branch.

### P2: Frontend Guards, Fallbacks, And API Contracts Need Dedicated Tests

Evidence:

- `AuthGuard` and `ProfessorAuthGate` are mostly client-side/hydration behavior.
- Pure auth redirect logic now covers role-aware root redirects: the proxy receives the stored role cookie and professors hitting `/` route to `/professor`; stale token redirects clear both auth cookies in the proxy implementation.
- Student professor-chat navigation eligibility now lives in `frontend/lib/authPolicy.ts`, and active nav-route matching lives in `frontend/lib/navigationPolicy.ts` instead of being reimplemented inside nav components.
- Subject identity/canonicalization now lives in `frontend/lib/subjectIdentity.ts`; home shortcuts, profile subject progress, and courses filtering/bucketing share the same chemistry/physics/math alias rules.
- Permanent sidebar quest normalization now preserves live API quest titles and uses default quest copy only for missing/blank titles or empty fallback data.
- Actual Next proxy behavior now has direct coverage for unauthenticated student/professor redirects, expired-cookie cleanup, professor landing redirects, and valid-token pass-through.
- AuthGuard and ProfessorAuthGate component behavior now has direct jsdom coverage for stored-session rendering, route-specific unauthenticated redirects, server-confirmed professor access, server-denied professor access, and logout-on-profile-failure.
- Leaderboard widget hook order now keeps memo hooks before the loading return, satisfying React hook invariants.
- Payment success verification and Pro checkout creation now live in `frontend/lib/payments.ts`, with unit coverage for missing session ids, encoded session ids, paid/unpaid/error verification states, checkout URL creation, missing checkout URLs, and backend error detail preservation.
- Admin fallback catalog, video mock OTP, and fallback UI branches are not directly asserted.
- API response assumptions are hardcoded in frontend code without shared schema or contract tests.

Required outcome:

- Add fallback UI tests.
- Add a contract testing strategy for core DTOs before changing large API surfaces.

### P2: Migration And Repo Hygiene Gaps

Evidence:

- Alembic upgrade to head passes.
- Data-integrity duplicate audit currently passes with no findings against the local backend database.
- `0000_local_baseline.py` uses metadata create/drop behavior rather than explicit table operations.
- `scripts/check_repo_hygiene.py` now rejects tracked OS artifacts, local databases, package tarballs, generated output directories, non-example `.env` files, and root `TODO-MANUAL.md`.
- The working tree deletes `.DS_Store`, `backend/.DS_Store`, tracked `.codex-logs` dev logs, backend `.next` traces, validation SQLite files, `frontend/es-toolkit-1.46.1.tgz`, and `TODO-MANUAL.md`; manual operations moved to `docs/manual-operations.md`.
- `backend/db.sqlite3` was backed up under ignored `.codex-logs/local-artifact-backups/`; the active local FastAPI dev servers that held it open were stopped, and the tracked runtime copy is now deleted from the working tree.

Required outcome:

- Add CI hygiene checks for generated artifacts and local databases.
- Decide whether to rewrite local baseline migrations only if it will not break existing environments.
- Add migration downgrade or round-trip testing once migration history is stable enough.

## Testing Tree

### Backend

- Current green gate: `python -m pytest -q`.
- Current migration gate: `alembic upgrade head` locally against in-memory SQLite, plus Backend CI/deploy against a disposable Postgres service.
- Current data-integrity gate: `python scripts/audit_data_integrity.py`, also wired into Backend CI/deploy against the migrated disposable Postgres database.
- Missing next gates:
  - remaining progress edge coverage after current gating tests
  - `test_courses_edges.py`
  - remaining uncovered `xp.py` edge cases and course compatibility edges
  - broader professor audit assertions for future mutation endpoints
  - seed-script non-local refusal tests

### Frontend

- Current green gates: lint, typecheck, unit tests, build, mocked Playwright smoke, first real integration E2E.
- Missing next gates:
  - fallback/demo UI tests
  - API DTO/contract tests for critical flows
  - one non-mocked browser integration journey

### Integration

- Current state: not established.
- Required first journey:
  - local test database
  - backend server
  - frontend server
  - real signup or login
  - dashboard load
  - one gated topic/course action
  - one profile/activity assertion

### CI And Deploy

- Current state: CI workflows exist, local gates pass, repo hygiene checks run in CI/deploy, Frontend deploy runs the real integration E2E before Vercel deploy, frontend deploy validates pulled Vercel production env before `vercel build`, Backend CI/deploy run Postgres Alembic plus data-integrity checks, backend deploy renders and validates Zappa production env before Lambda deploy, backend deploy hits the configured `BACKEND_READY_URL` after deploy, and deploy-time `vercel`, `pytest`, and `zappa` installs are pinned.
- Missing next gates:
  - workflow linting when an Actions linter is available

### Data And Migrations

- Current green gate: upgrade to Alembic head.
- Missing next gates:
  - downgrade or round-trip policy
  - seed safety refusal tests
  - local demo data isolation

## One-Change-At-A-Time Branch Plan

Each follow-up branch should start from `codex/production-hardening-final`, make one scoped production-hardening change, update this ledger, run the required gates, and merge only after review.

1. `codex/hardening-env-secret-hygiene`
   - Add env validation, production CORS tests, deploy secret checks, and artifact/secret scan.
   - Required gates: backend tests, frontend lint/typecheck, env validation tests, workflow lint if available.

2. `codex/hardening-seed-safety`
   - Add local-only guards to all destructive seed scripts.
   - Required gates: backend tests plus dedicated seed refusal tests.

3. `codex/hardening-integration-smoke`
   - Complete: first non-mocked backend/frontend integration journey added for demo login and courses.
   - Required gates now include: backend tests, frontend build, mocked E2E, real integration E2E.

4. `codex/hardening-professor-controls`
   - Complete: active-assignment policy, professor audit logs, and professor mutation rate-limit coverage are enforced and tested.
   - Required gates: backend tests plus professor-specific tests.

5. `codex/hardening-notes-saves-activity-xp`
   - In progress: backend notes/saves context and create activity events are aligned.
   - Remaining: XP reason wiring or doc pruning, resource/note-edit/exam activity events, and one profile restoration integration assertion.
   - Required gates: backend tests, frontend relevant tests, one profile restoration test.

6. `codex/hardening-router-coverage`
   - Add focused tests for progress and course edge paths.
   - Required gates: backend tests.

7. `codex/hardening-frontend-guards-contracts`
   - Add guard/proxy/fallback tests and the first DTO contract strategy.
   - Required gates: frontend lint/typecheck/test/build, relevant E2E.

8. `codex/hardening-migration-hygiene`
   - Add migration policy/gates and repo artifact hygiene enforcement.
   - Required gates: Alembic upgrade, selected migration tests, hygiene scan.

## Recursive Audit Passes

On 2026-05-26, the six audit lanes were run through four additional recursive passes with different goals:

| Pass | Goal | Output |
| --- | --- | --- |
| Pass 1 | Docs-to-implementation completeness | Found operational readiness gaps, token lifecycle gaps, overstated product promises, endpoint coverage risk, frontend route contract risk, and schema idempotency risk. |
| Pass 2 | Verification design | Converted gaps into concrete tests/gates, including expected current failures and false-positive eliminations. |
| Pass 3 | Branch decomposition | Split the work into small branch plans with file ownership, dependencies, conflicts, and rollback risk. |
| Pass 4 | Adversarial release-blocker review | Cut the plan down to true blockers, deferrable work, and go/no-go checklists. |

### Pass 4 Master Adjudication

The agents produced evidence. The release-blocker judgment below is the master branch policy, not a blind copy of the agent outputs.

#### Release-Blocking Before Production Candidate

1. Production config must fail closed.
   - Add production startup validation before adding more deploy automation.
   - A deploy that can boot with missing critical config is not a production candidate.

2. Backend needs real readiness, not only liveness.
   - Complete: `/health` stays cheap while `/ready` checks production config policy plus database connectivity.
   - Complete: Backend deploy requires `BACKEND_READY_URL` and retries the readiness endpoint after Lambda deployment.

3. Auth token lifecycle core must stay fixed.
   - Complete: password reset tokens are single-use after successful reset.
   - Complete: existing bearer JWTs are invalidated after password reset.
   - Remaining: secret-domain separation is important, but it must be coordinated with env validation because it changes deploy configuration.

4. At least one real frontend-backend browser smoke must exist.
   - Mocked Playwright smoke remains useful, but it cannot prove the app works against the real backend.
   - The first live path should cover watch/video, topic workspace, and at least one professor route if professor is in launch scope.

5. Revenue and irreversible user-state routes need direct backend tests.
   - Checkout creation coverage is complete.
   - Progress/XP idempotency is a release gate because duplicate award/state corruption is hard to unwind.
   - Locked-content redaction and legacy stream/access denial coverage is complete for lesson stream, lesson activities, PDFs, video quiz triggers, section stream, and redacted watch context.

6. Product scope must be honest.
   - Professor approval workflow is a blocker if professor content editing is in launch scope.
   - Exam Bank advanced filters/actions, exact notes/saves tab-resource deep links, live recording handoff, VIP speak/audio, and a first-class notifications inbox must be explicitly downgraded unless implemented and tested.

7. Data integrity must be audited before constraints land.
   - `LessonProgress`, `ContentProgress`, `SavedItem`, `DailyQuest`, and `XPTransaction` idempotency scope are the near-term integrity targets.
   - Entitlement uniqueness, `TopicItemProgress` FKs, polymorphic comment integrity, and live interaction DB idempotency are not safe final-push migrations without product/data decisions.

#### Deferrable Or Non-Blocking Work

- Full observability stack integration can wait; structured logs and request/event correlation are the first production step.
- Media magic-byte validation is useful hardening, but lower priority than auth lifecycle unless uploads become a larger public content surface.
- Stripe verify-session ownership checks, checkout creation, centralized entitlement transitions, and one-time billing-model clarity now have direct backend/product coverage; future payment work should focus on frontend payment success/error states.
- Full notifications page can wait if the product decision is dropdown-only.
- Live recording handoff and VIP speak/audio should be future scope unless the launch promise says otherwise.
- Broad schema cleanup should wait; audit first, constrain only clear natural keys.

### Revised First-Branch Order

This order supersedes the earlier broad branch list for the immediate final push:

1. `codex/hardening-startup-validation`
   - Fail closed on missing production config.
   - Coordinate with any secret/env work before merging.

2. `codex/hardening-auth-lifecycle`
   - Complete: reset-token replay is rejected through `auth_token_version`.
   - Complete: old JWTs are invalidated after password reset.
   - Required gates now include: backend auth tests, broad auth-adjacent tests, full backend tests, Alembic upgrade.

3. `codex/hardening-payments-checkout-tests`
   - Complete: direct checkout creation coverage now proves router persistence, customer reuse, one-time `pro` plan validation, missing config, Stripe metadata, and return URL behavior.
   - Complete: payment entitlement mutations moved out of the router into `backend/app/services/payment_entitlements.py`, with focused service coverage for checkout upgrades, webhook upgrades, customer preservation, customer persistence, and legacy defensive revocation.
   - Complete: frontend pricing/payment-success copy and Stripe docs now match the one-time hosted Checkout model.

4. `codex/hardening-progress-idempotency`
   - Complete: duplicate progress/XP award paths now use idempotency keys through the shared XP service.
   - Complete: client-spoofed quiz pass and score state remains server-scored and covered.
   - Required gates now include: focused progress/quiz/XP tests, full backend tests, Alembic upgrade.

5. `codex/hardening-real-backend-smoke`
   - Add a non-mocked browser smoke against local backend/frontend with seeded data.
   - Cover watch/video, topic workspace, profile, and professor route if professor is in scope.

6. `codex/hardening-course-stream-redaction`
   - Complete: locked legacy lesson and section stream/access routes deny protected payloads before provider calls.
   - Complete: redacted watch context still returns navigable metadata without video ids, quiz data, content, or activity payloads.
   - Required gates now include: focused locked-content tests, full backend tests, Alembic upgrade.

7. `codex/hardening-product-scope-honesty`
   - Downgrade future-scope docs now.
   - Decide whether professor approval workflow is launch scope; if yes, split it into its own implementation branch.

8. `codex/hardening-data-integrity-audit`
   - Complete: read-only duplicate audit covers `LessonProgress`, `ContentProgress`, `SavedItem`, `DailyQuest`, and non-empty `XPTransaction.idempotency_key` groups.
   - Complete: focused test seeds duplicate state groups and proves the audit reports them without treating null XP idempotency keys as duplicates.
   - Complete: Backend CI and Backend deploy run the audit immediately after Alembic upgrade against a migrated disposable Postgres database.
   - Only then add safe constraints in follow-up branches.

### Recursive Agent Lane Outputs

| Lane | Pass 4 Hard Recommendation |
| --- | --- |
| Operations | Production startup validation, readiness, and post-deploy readiness checks are in place; next operations slice should add workflow linting or external uptime monitoring. |
| Security | Reset-token replay prevention and JWT invalidation are complete; coordinate secret-domain separation with env validation next. |
| Product | Downgrade future-scope promises and implement professor approval only if it is truly MVP scope. |
| Backend tests | Checkout creation, progress idempotency, locked stream/redaction, data-integrity duplicate audit, access-service coverage, and direct auth-service coverage are complete for this pass; next backend slice should target uncovered XP/course edge cases and branch hygiene. |
| Frontend | Build the live-backend smoke setup and validate watch, topic workspace, and professor routes against real backend contracts. |
| Data/schema | Audit before constraints; constrain only clear near-term natural keys and defer policy-heavy migrations. |

## Agent Rules For Follow-Up Work

- One branch per change.
- One owner agent/chat per branch.
- Keep scope disjoint unless the branch explicitly updates a shared contract.
- Do not stage or commit ignored env files.
- Do not print secret values in logs, docs, tests, or chat.
- Do not remove development/demo paths until the production gate replacing them exists.
- Every branch must update this ledger with:
  - changed files
  - test commands run
  - green/red results
  - remaining untested surface
  - explicit rollback risk
- Every branch must state whether it changes runtime behavior, only tests, only docs, or CI/deploy behavior.
- Broad refactors are blocked unless they are required to make a specific production gate possible.

## Definition Of Ready For Production Candidate

The app is not ready for a production candidate until these are true:

- No local secret or generated database artifact is tracked.
- Production startup fails closed on missing critical config.
- Deploy workflows validate required production env vars before deploy.
- Destructive seed scripts refuse non-local databases.
- At least one real browser-to-backend integration journey is green.
- Mocked E2E is labeled and retained as smoke coverage only.
- Professor production policy is explicit and tested.
- Notes, saves, activity, and XP behavior matches the docs or the docs are corrected.
- Backend router/service coverage gaps are either tested or listed as accepted release risk.
- This ledger is updated with the final green/red state before release.
