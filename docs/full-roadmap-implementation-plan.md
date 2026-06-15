# Full Roadmap Implementation Plan

This plan treats "everything" as the full product roadmap plus the production,
security, finance, legal, and operations work required to safely launch it.

The current executable production gate is still closed:

- Current non-Stripe launch readiness: `5.5/10`.
- Target broad student production readiness: `9/10`.
- Current blocker count: `11` incomplete launch-gate rows.

The main rule for this plan is simple: feature work and hardening must advance
together. Shipping all features first and adding security only at the end would
create too many hidden rewrites. The correct sequence is to build foundations,
then features, then security/evidence, then run the final 10-day testing freeze.

## Program Shape

### Phase 0: Scope Lock And Work System

Goal: turn the audit into executable work.

Deliverables:

- Create epics for every roadmap area.
- Add acceptance criteria before implementation starts.
- Freeze launch terminology: Subject, Topic, TopicSection, TopicItem, Resource,
  TabContent, QuestionSet, Question, Entitlement.
- Decide exact paid packages: semester subject access, VIP, Platinum, live,
  professor chat, exam bank, and downloadable resources.
- Decide which current compatibility surfaces remain until after launch:
  `Chapter`, `Lesson`, `ChapterSection`, `LessonProgress`, and legacy routes.

Output artifacts:

- Access and package ADR.
- Content operations spec.
- Backoffice permission matrix.
- Finance ledger ADR.
- Notification matrix.
- Moderation SOP.
- Support workflow.
- Legal/privacy checklist.
- Final launch checklist.

Exit criteria:

- Every feature below has owner, acceptance tests, migration impact, and launch
  priority.
- No new feature starts without a matching test/evidence plan.

## Phase 1: Platform Foundations

These foundations should happen before large user-facing feature work, because
many later features depend on them.

### 1.1 Backoffice And RBAC

Build a real permissioned staff platform.

Backend:

- Add `staff_roles`.
- Add `staff_permissions`.
- Add `staff_role_assignments`.
- Add `require_permission(...)` dependencies.
- Keep `users.is_staff` as a broad staff marker only.
- Keep `users.is_superuser` only for emergency ownership.
- Restrict SQLAdmin `/admin` to `super_admin` plus `sqladmin:access`.
- Add audit logs for role assignment, permission changes, user changes, exports,
  manual grants, refunds, content publication, and live controls.

Frontend:

- Replace the generic `/admin` operational dashboard with `/backoffice`.
- Add zones:
  - `/backoffice/users`
  - `/backoffice/content`
  - `/backoffice/live`
  - `/backoffice/finance`
  - `/backoffice/security`
  - `/backoffice/support`
- Keep `/admin` linked only as "Emergency SQLAdmin" for super admins.

Tests:

- Staff without permission gets `403`.
- Finance viewer cannot refund or grant access.
- Content admin cannot touch money.
- Live ops cannot manage roles.
- Security auditor can read audit logs but cannot mutate finance/content.
- SQLAdmin rejects staff without `sqladmin:access`.

### 1.2 Finance Source Of Truth

Make money append-only and provider-agnostic.

Tables:

- `payment_provider_events`
- `payment_transactions`
- `finance_ledger_entries`
- `refund_requests`
- `refunds`
- `manual_access_grants`
- `reconciliation_imports`
- `finance_exports`

Rules:

- Never edit/delete money history to "fix" a payment.
- Append correction events and ledger reversals.
- Entitlements are the access source of truth.
- `users.is_pro` is only a cache/projection.
- Every manual grant requires reason, expiry, actor, and audit log.
- Long or free grants should require approval.

Core flow:

```text
provider callback
-> insert provider event once
-> update transaction
-> append ledger entry
-> create or extend entitlement
-> update projection/cache
-> write audit log
```

Refund flow:

```text
finance admin request
-> optional super-admin approval
-> provider refund
-> provider refund event
-> ledger reversal
-> revoke or shorten entitlement
-> write audit log
```

Backoffice:

- Finance overview.
- Transactions list.
- Provider event list.
- Ledger view.
- Refund queue.
- Manual grant workflow.
- Reconciliation import.
- Accountant export.

Tests:

- Duplicate provider events are idempotent.
- Wrong-user checkout/session cannot grant access.
- Failed payment does not create entitlement.
- Refund reversal changes entitlement correctly.
- Manual grant without reason/expiry is rejected.
- Ledger totals match transaction totals.

### 1.3 Payment Gateway Rewrite

Remove Stripe from the target launch architecture and replace it with a
provider-agnostic Moroccan payment gateway layer.

Target payment rails:

- CMI for local card payments.
- Virement bancaire for bank transfer/manual reconciliation.
- CashPlus for cash/offline payment collection and later reconciliation.
- AshPlus or any equivalent cash-agency rail using the same pending,
  proof/report, reconciliation, and finance approval model.

Core payment architecture:

- Add a provider-neutral payment service with explicit transaction states:
  `draft`, `pending_provider`, `pending_manual_review`, `paid`, `failed`,
  `expired`, `refunded`, `cancelled`.
- Keep provider-specific details in adapter payloads and immutable provider
  event rows, not in user rows.
- Remove Stripe checkout/webhook code from the launch path after the new rails
  are implemented and migrated.
- Keep a short-lived compatibility shim only if needed to avoid breaking old
  routes during migration; do not build new features on Stripe.
- Entitlements and ledger entries remain the source of truth. `users.is_pro`
  remains only a cache/projection.

CMI work:

- Add CMI envs:
  - `CMI_CLIENT_ID`
  - `CMI_STORE_KEY`
  - `CMI_PAYMENT_URL`
  - `CMI_OK_URL`
  - `CMI_FAIL_URL`
  - `CMI_CALLBACK_URL`
- Add create-payment endpoint.
- Add signed callback endpoint.
- Verify callback hash/signature before granting access.
- Use unique idempotent CMI order IDs.
- Add CMI success/fail pages.

Virement work:

- Add bank-transfer payment request flow with generated reference code.
- Show bank coordinates, amount, reference, and expiry to the student.
- Add backoffice upload/review of proof of transfer.
- Add finance approval/rejection workflow.
- Add reconciliation import from bank statements.
- Grant or extend entitlement only after finance approval or matched bank
  reconciliation.

CashPlus work:

- Add CashPlus payment request flow with generated reference/order code.
- Track expected amount, payer identity, expiry, and provider reference.
- Support manual finance confirmation in v1 if no automated callback is
  available.
- Add reconciliation import/matching for CashPlus reports.
- Grant or extend entitlement only after confirmed collection.

AshPlus / alternate cash-agency work:

- Model AshPlus as a provider-neutral cash-agency variant, not a separate
  one-off payment system.
- Reuse the CashPlus pending request, generated reference, proof/report import,
  duplicate-safe reconciliation, and finance-audited entitlement workflow.
- Keep provider-specific receipt fields in adapter payloads/provider events so
  future cash-agency providers can be added without changing entitlement logic.

Frontend work:

- Replace Stripe checkout UI with a payment-method selector:
  CMI card, virement, CashPlus, and AshPlus/cash-agency variants.
- Add method-specific pending states and instructions.
- Add payment success, failed, pending review, and support/escalation states.
- Make access pages explain that virement, CashPlus, and AshPlus/cash-agency
  payments may require manual confirmation before unlock.
- Remove Stripe from the visible launch checkout path once the replacement
  rails are usable; keep any Stripe code only as a temporary compatibility
  shim during migration.

Tests:

- Fake CMI callback rejected.
- Duplicate CMI callback idempotent.
- Tampered amount rejected.
- Wrong-user order rejected.
- Virement proof upload does not grant access before finance approval.
- Duplicate bank/CashPlus reconciliation rows are idempotent.
- Duplicate AshPlus/cash-agency reconciliation rows are idempotent.
- Wrong amount or wrong reference creates a mismatch queue item, not access.
- CashPlus/AshPlus manual confirmation requires finance permission and audit
  log.
- Stripe checkout is absent from launch payment UI and new payment features do
  not call Stripe services.
- Provider outage creates visible support state, not silent failure.

### 1.4 Content Model And Versioning Foundation

Clean up the canonical content model before adding banks and authoring tools.

Backend:

- Confirm Topic/TopicItem as canonical.
- Document compatibility route deletion order.
- Add content quality status where missing.
- Add content version/snapshot primitives for quizzes, exercises, resources, and
  published corrections.
- Add concept tags and difficulty metadata where missing.
- Add content rights/license/source metadata.

Backoffice:

- Content inventory.
- Draft/review/published/needs-fix/deprecated states.
- Broken media queue.
- Missing correction queue.
- Professor suggestion review queue.

Tests:

- Published edits do not corrupt old attempts.
- Draft content is not visible to students.
- Deprecated content remains available for historical attempts where needed.

## Phase 2: Core Student Product Features

These are the features students experience directly.

### 2.1 Payment And Access Rewrite

Student-facing features:

- My access/status page.
- Owned subjects and active package display.
- Locked content explanation everywhere.
- Upgrade/renew flow.
- Payment pending/failed/succeeded states.
- Refund/access support path.
- Manual grant visibility where appropriate.
- Package/tier labels: Basic, Pro, VIP, Platinum.

Backend:

- Entitlement-based access checks for subjects, live, professor chat, resources,
  quizzes, summaries, exam bank, and premium downloads.
- Projection job or service to keep cached access flags fresh.

Tests:

- Forged frontend values cannot unlock content.
- Expired entitlement locks access.
- Subject A access does not unlock Subject B.
- VIP/Platinum overlays are scoped correctly.

### 2.2 Bac Exam Video Bank

Purpose: end-of-year Bac preparation with exam problems and video answers.

Features:

- Browse by subject, year, session, topic, concept, difficulty, status.
- Full exam view.
- Individual exam problem view.
- Video answer primary.
- Written statement/correction supporting.
- Save, attempt, watched, weak theme tracking.
- Deep links to exact problem and correction.
- Admin import for exams/problems/videos/corrections.

Backend:

- Normalize exam, problem, correction, video, concept, source metadata.
- Link exam problems to Topic/TopicItem/ConceptTag.
- Track problem attempts and correction views.

Tests:

- Locked exam videos do not leak provider IDs/URLs.
- Problem status updates are idempotent.
- Filters return scoped authorized results.

### 2.3 Lesson Exercise Bank

Purpose: year-round high-volume practice.

Features:

- Filter by lesson/topic/concept/difficulty/status.
- Exercise detail page.
- Hints, steps, formula blocks, diagrams, written correction.
- Optional video solution.
- Attempt state: not started, tried, wrong, corrected, mastered.
- Retry queue integration.

Backend:

- Exercise model or TopicItem subtype.
- Correction step model or structured JSON.
- Concept tags.
- Attempt records.
- XP hooks.

Tests:

- Student cannot mark correctness by forged client value.
- Corrections can be published/versioned safely.
- Attempt state feeds mistake notebook.

### 2.4 Quiz Architecture And Integrity

Purpose: one official quiz path for rendering, authoring, grading, and progress.

Work:

- Consolidate duplicate quiz UIs into one renderer.
- Make `QuestionSet` and `Question` the primary authoring model.
- Keep flexible `config_json` and `answer_json`.
- Add quiz version snapshots.
- Separate demo/practice quizzes from official progress quizzes.
- Add admin validation before publish.
- Ensure every XP/progress route uses backend grading only.

Supported types:

- Multiple choice.
- True/false.
- Fill in blank.
- Matching.
- Ordering.
- Drag and drop.
- Short answer.
- Numeric answer.
- Multi-select.
- Interactive checkpoint.

Tests:

- Client score is ignored.
- Old attempts keep old quiz version.
- Broken quiz config cannot publish.
- Every renderer has empty/error/loading states.

### 2.5 Mistake Notebook

Purpose: turn weak points into revision.

Sources:

- Wrong quizzes.
- Failed exercises.
- Rewatched corrections.
- Repeated weak concepts.
- Manual "retry later".
- Low confidence answers.

Features:

- Mistake list.
- Concept grouping.
- Retry schedule.
- Links to exact question, correction, video timestamp, topic item, tab.
- Mastered/resolved state.
- Teacher/professor suggested review items later.

Tests:

- Wrong answers create notebook entries idempotently.
- Retry completion updates mastery.
- Deep links restore exact context.

### 2.6 XP, Leaderboard, Badges, And Mastery

Build a real learning economy.

Artifacts:

- XP economy doc.
- Badge rules doc.
- Anti-farming rules.

Features:

- XP for verified learning actions.
- Daily/weekly/monthly/semester seasons.
- Leagues.
- Badges with rarity and inventory.
- Quests by subject, weak area, streak, exam prep, mistake review.
- Mastery by concept.
- Decay/spaced repetition.
- XP audit dashboard.

Backend:

- XP category caps.
- Reversal/adjustment transactions.
- Idempotency keys everywhere.
- Season leaderboard projection.
- Badge award service.

Tests:

- Duplicate attempts cannot farm XP.
- Reversals recalculate projections.
- Admin correction is audited.
- Leaderboards do not sort all users on request.

### 2.7 Notes, Saves, Comments, Ratings

Features:

- Notes deep-link to item/tab/video timestamp/exercise/problem.
- Saves restore exact context.
- Comments with moderation state.
- Ratings for videos, explanations, corrections, exercises, AI answers.
- Ratings feed content quality queues.

Tests:

- Deep links restore context.
- Hidden comments do not show publicly.
- Ratings cannot be spammed beyond policy.

### 2.8 Structured Course Pages And Summary Downloads

Structured course pages:

- Definitions.
- Properties.
- Theorems.
- Figures.
- Examples.
- Formula blocks.
- Warning blocks.
- Method blocks.
- Common mistake blocks.
- Staff-editable blocks where possible.

Summary downloads:

- Attach to subject/topic/item/concepts.
- Gate by entitlement.
- Track opens/downloads/saves.
- Version and replace safely.
- Broken-file queue.

Tests:

- Locked files cannot be downloaded.
- Version replacement does not break old references.
- Broken resource appears in needs-attention queue.

### 2.9 Student Settings

Features:

- Name.
- Avatar/banner.
- Niveau/filiere.
- Email change.
- Password change.
- Notification preferences.
- Export/delete account request.
- Session/logout controls.
- Dark mode later.

Tests:

- Email/security changes require proper auth.
- Media quotas enforced.
- Data request creates support/admin workflow.

## Phase 3: Professor And Live Features

### 3.1 Professor Panel

Features:

- Dashboard.
- Course offering scope.
- Student chat search/filter/unread/pin/attachments.
- Live dashboard.
- OBS/provider setup help.
- Recording status.
- Notifications.
- Settings.
- Optional analytics.

Rules:

- Everything is scoped to `CourseOffering`.
- Every mutation is audited.
- No professor can access another offering.

Tests:

- Cross-offering access denied.
- Mutations write audit log.
- Upload/read media remains private.

### 3.2 Professor Quiz Suggestions

Flow:

```text
professor draft
-> validation
-> admin preview
-> approve/reject
-> publish snapshot
-> audit
```

Fields:

- Quiz type.
- Prompt.
- Options/input config.
- Answer.
- Explanation.
- Difficulty.
- Concept tags.
- Course/topic/item/tab link.

Tests:

- Professor cannot publish directly.
- Invalid config cannot be approved.
- Rejected suggestion remains auditable.

### 3.3 Live Platform Completion

Features:

- Live state machine.
- Attendance heartbeat.
- Join/drop/reconnect logs.
- Checkpoint responses.
- Optional grading.
- Participation scoring.
- Professor mute.
- Slow mode.
- Blocklist.
- Pin question.
- Upvotes.
- Report/hide/delete messages.
- Room-level spam controls.
- Backend live kill switches.
- Recording ingestion/review/publish/archive.
- VdoCipher per-viewer token verification if needed.

Tests:

- Cannot start cancelled/completed session.
- Cannot end scheduled/cancelled session.
- Attendance records are durable.
- Moderation actions are scoped/audited.
- Realtime fallback has backoff/jitter.
- 50-student fanout staging probe passes.

## Phase 4: Trust, Support, Moderation, And Operations Features

### 4.1 Report Problem Everywhere

Surfaces:

- Videos.
- Exercises.
- Corrections.
- Quizzes.
- Live.
- Comments.
- AI answers.
- Payment/access.
- App bugs.

Captured context:

- URL.
- User.
- Content object.
- Timestamp.
- Device.
- Screenshot if possible.
- Severity/type.

Backoffice:

- Report queue.
- Assignment.
- Status.
- Hide/delete/restore where relevant.
- Escalation.
- Audit log.

### 4.2 Help And Support Center

Features:

- Support home.
- Ticket categories.
- Ticket status.
- Payment/access escalation.
- Refund support.
- Broken content support.
- Account support.
- Support history.
- Admin assignment.
- Priority/SLA later.

Tests:

- Tickets preserve context.
- Finance-only actions require finance permission.
- User sees status without seeing private staff notes.

### 4.3 Admin Needs Attention

Queues:

- Broken videos.
- Failed payments.
- Failed uploads.
- Reports.
- Missing corrections.
- Unreviewed suggestions.
- Live issues.
- AI answers reported wrong.
- Low-rated content.
- Ledger mismatches.
- Reconciliation mismatches.

### 4.4 Notification System

Create notification matrix:

- Event.
- Audience.
- Channel.
- Priority.
- Frequency.
- Digest behavior.
- Preference.
- Fallback state.

Features:

- Live reminders.
- Professor replies.
- Payments/refunds.
- Reports/support updates.
- Streaks/quests.
- Announcements.
- Admin alerts.
- Quiet hours later.
- Push/PWA later.

Tests:

- Preferences respected.
- No spam loops.
- Delivery/seen/read semantics are distinct.

## Phase 5: Content Production, Search, AI, And Data Pipeline

### 5.1 Content Production Workflow

Build the engine for creating the actual content volume.

Features:

- Import templates.
- Bulk import for exercises, diagrams, transcripts, summaries, quiz questions.
- Validation.
- Writer/reviewer/publisher roles.
- QA states.
- Ownership per content object.
- Content rights/source metadata.
- Takedown workflow.

### 5.2 Search Architecture

Domains:

- Catalog search.
- Topic search.
- Exercise search.
- Bac exam search.
- Transcript search.
- Admin search.
- Professor chat search.
- AI retrieval search.

Work:

- Define result taxonomy.
- Define filters.
- Define permission checks.
- Add transcript snippets.
- Add ranking rules.
- Add vector/hybrid search later.

### 5.3 Data And Transcript Pipeline

Features:

- Timestamped transcripts.
- Subject/topic/concept links.
- Normalized exercises.
- Corrections.
- Summaries.
- Quizzes.
- Source quality.
- Student helpfulness signals.
- Embedding jobs later.

### 5.4 AI Tutor And RAG

Do AI after trusted content data exists.

Initial scope:

- Retrieval over Kresco content.
- Strict Bac prompt.
- Current screen context.
- Topic/item/tab/quiz/exercise/video minute context.
- Answer citations from transcripts, corrections, summaries, exercises.
- Suggest videos/exercises/summaries/labs.
- Report bad answer.

Security:

- Do not send private student/payment data.
- Respect content access gates.
- Log/report bad answers.
- Do not fine-tune until rights and quality are clear.

## Phase 6: Mobile, Accessibility, Design System, Legal

### 6.1 Mobile And PWA

Before native:

- Test cheap-phone viewports.
- Video UX.
- Payments.
- Forms.
- Chat.
- Live.
- Topic workspace.
- Exam bank.
- Performance budgets.

PWA later:

- Install.
- Offline rules.
- Push.
- Background sync.
- Downloads if allowed.

### 6.2 Accessibility And i18n

Work:

- Make French the source copy.
- Inventory English/hard-coded strings.
- Keyboard navigation audit.
- Contrast audit.
- Math labels and screen-reader basics.
- Arabic/RTL compatibility later.

### 6.3 Design System Debt

Work:

- Shared primitives.
- Shared shells for student/professor/backoffice/auth.
- Shared table/form/card/error/loading states.
- Remove hard-coded color/style drift gradually.

### 6.4 Legal, Privacy, And Paper Ops

Required before broad production:

- Privacy Policy.
- Terms/CGU.
- Terms of Sale/CGV.
- Refund/Cancellation Policy.
- Cookie Policy.
- Legal Notice.
- User consent capture.
- Consent storage.
- User data export/delete request flow.
- Vendor/subprocessor list.
- Retention policy.
- CNDP legal review.
- CMI/bank merchant dossier.
- Content rights/contributor policy.
- Minor/guardian consent position.

## Phase 7: Security, Observability, Scale, And Production Evidence

This is not a final polish step. It must run throughout implementation and then
become the final hardening pass before the testing freeze.

Security:

- Secret scanning.
- Dependency scanning.
- CodeQL.
- OWASP ZAP against staging.
- Authorization tests.
- Rate limiting.
- Audit logs.
- Backups and restore drill.
- WAF/firewall.
- CloudTrail/GuardDuty/budget/RDS/Lambda/API alarms.

Observability:

- Sentry backend/frontend.
- PII scrubbing.
- Release tagging.
- CloudWatch/Vercel logs.
- PostHog product analytics.
- Feature flags.
- Incident response doc.

Scale:

- Redis/ElastiCache for hot read models.
- Route-level DB timing/query-count logging.
- `pg_stat_statements`.
- RDS Proxy enforcement.
- Lambda reserved concurrency.
- API throttles.
- Polling backoff/jitter.
- Realtime outbox alarms.
- Redis-backed rate limiting.
- Debounced video progress.
- Batch async non-critical writes.
- Cursor pagination.
- Composite hot-path indexes.
- Load-test scripts.
- Route performance budgets.

Current production gate blockers to close:

- `SEC-SECRETS-001`
- `MEDIA-S3-001`
- `MEDIA-AUTH-001`
- `RT-FANOUT-001`
- `RT-OUTBOX-001`
- `PERF-TOPIC-001`
- `FE-DEMO-001`
- `OPS-STAGE-001`
- `OPS-RDS-001`
- `OPS-LAMBDA-001`
- `OPS-RUNBOOK-001`

## Recommended Work Order

### Milestone 1: Foundations

- Scope/ADR docs.
- RBAC/backoffice shell.
- Finance ledger model.
- Payment provider abstraction.
- Content versioning/quality states.
- Support/report/moderation base models.

### Milestone 2: Student Core

- Payment/access rewrite.
- Bac Exam Video Bank.
- Lesson Exercise Bank.
- Quiz architecture.
- Mistake Notebook.
- Notes/saves/comments/ratings.
- Structured course pages.
- Summary downloads.
- Student settings.

### Milestone 3: Gamification

- XP economy.
- XP caps/reversals.
- Seasons/leagues.
- Badges.
- Quests.
- Mastery model.
- XP audit dashboard.

### Milestone 4: Professor/Live

- Professor panel.
- Quiz suggestions.
- Live state machine.
- Attendance/checkpoints.
- Moderation controls.
- Recording workflow.

### Milestone 5: Ops And Trust

- Report everywhere.
- Support center.
- Needs-attention queues.
- Notification matrix and preferences.
- Finance reconciliation.
- Alerts.

### Milestone 6: Content/AI/Search

- Content import pipeline.
- Search architecture.
- Transcript pipeline.
- RAG tutor.

### Milestone 7: Mobile/Legal/Design

- Mobile readiness.
- PWA basics if needed.
- A11y/i18n audit.
- Legal pages and consent.
- Design system cleanup.

### Milestone 8: Security And Evidence Freeze

- Security scans.
- Authorization suite.
- OWASP ZAP.
- Staging runtime evidence.
- RDS/Lambda/runbook drills.
- Launch gate reaches 9/10.

## Final 10-Day Testing Freeze

No new features during these 10 days unless a launch blocker requires a fix.

Day 1: automated baseline

- Backend tests.
- Migrations.
- Data integrity audit.
- Frontend lint/typecheck/tests/build.
- Playwright mocked and backend-backed integration tests.

Day 2: auth, RBAC, and backoffice

- Role/permission matrix.
- SQLAdmin boundary.
- Audit logs.
- Staff session revocation.
- Cross-role abuse attempts.

Day 3: payment, finance, CMI, virement, CashPlus

- Checkout.
- CMI callback.
- Virement request/proof/reconciliation.
- CashPlus request/confirmation/reconciliation.
- Duplicate callbacks.
- Failed payments.
- Refunds.
- Manual grants.
- Ledger reconciliation.
- Entitlement expiry.

Day 4: student content and access

- Topic workspace.
- Exam bank.
- Exercise bank.
- Summaries/downloads.
- Video access.
- Locked content.
- Forged IDs and forged frontend values.

Day 5: quiz, XP, mastery, mistake notebook

- Backend grading.
- Quiz versions.
- XP idempotency/caps.
- Badge/quest awards.
- Mistake notebook deep links.
- Leaderboard projections.

Day 6: professor and live

- Professor dashboard.
- Chat.
- Quiz suggestions.
- Live start/end.
- Attendance.
- Checkpoints.
- Moderation.
- Realtime fanout.

Day 7: support, reports, moderation, notifications

- Report everywhere.
- Ticket workflow.
- Admin assignment.
- Content quality queues.
- Notification preferences.
- Delivery/seen/read semantics.

Day 8: performance and scale

- Topic workspace p95.
- DB query counts.
- Slow query plans.
- Load tests.
- Polling budgets.
- Realtime outbox latency.
- Lambda/runtime evidence.

Day 9: security and recovery drills

- Secret scan.
- Dependency scan.
- CodeQL.
- OWASP ZAP.
- Backup restore.
- Migration rollback rehearsal.
- Incident response drill.
- Provider outage drills.

Day 10: release decision

- Run `python scripts/check_production_launch_gate.py --json`.
- Confirm all traceability rows are `verified`.
- Confirm readiness score is at least `9/10`.
- Confirm legal/payment/CNDP/CMI paperwork is not blocking.
- Confirm rollback owner, database owner, and support owner.
- Freeze release commit.

## Practical Operating Rule

Each feature PR must include:

- Backend model/service/router changes where needed.
- Frontend page/component changes where needed.
- Migration if data shape changes.
- Unit tests.
- At least one integration or contract test for critical flows.
- Audit/security note if it touches money, access, roles, content publication,
  professor/live, media, or user data.
- Backoffice visibility if staff must operate it.

This prevents the roadmap from becoming a pile of isolated UI features with no
operational control.
