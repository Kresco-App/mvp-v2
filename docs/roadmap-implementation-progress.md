# Roadmap Implementation Progress

This file tracks implementation decisions, sequence, and verification for the
roadmap work. It is separate from the product TODO docs so the TODO remains a
specification and this file stays an execution log.

## Operating Rules

- Work one bounded problem at a time.
- Keep UI changes minimal and coherent with the existing design system until the
  dedicated UI pass.
- Prefer simple architecture when a decision is ambiguous, and record that
  decision here.
- Each implementation slice should include tests or a stated reason why it does
  not.
- Use subagents for focused codebase reconnaissance and strong review before
  pushing.
- Commit recoverable checkpoints instead of leaving a large uncommitted stack.

## Current Branch

- `codex/roadmap-implementation-foundations`

## Implementation Timeline

### Slice 1: Payment Gateway Foundation

Status: committed in `ad68deb8`.

Reason for starting here:

- The target payment architecture changed: Stripe is no longer the launch
  gateway.
- CMI, virement bancaire, and CashPlus need provider-neutral transaction states
  and auditability before UI polish or payment-method screens.
- AshPlus or any equivalent cash-agency rail should be handled through the same
  provider-neutral manual/cash reconciliation model, not as one-off payment
  code.
- This is foundational for access, entitlements, finance backoffice, support,
  reconciliation, and the 10-day test freeze.

Planned backend scope:

- Add provider-neutral payment rail constants/enums for `cmi`, `bank_transfer`,
  and `cashplus`. Status: implemented.
- Add provider-neutral transaction, provider-event, and ledger-entry tables
  without removing current Stripe behavior in the same slice. Status:
  implemented.
- Add schemas/services for creating manual payment instructions and recording
  pending states. Status: implemented for virement and CashPlus.
- Add CMI env loading, but keep CMI payment creation blocked until the adapter
  exists. Status: implemented.
- Add tests for provider/status validation and no-access-before-confirmation.
  Status: implemented.

Planned frontend scope:

- Keep UI minimal.
- Add only enough copy/data shape support to avoid hardcoding Stripe as the only
  payment path.

Initial decisions:

- Decision: keep current Stripe code as legacy/current-state compatibility for
  now, but do not build new payment features on top of it.
- Decision: Stripe is not a launch gateway. Future slices should remove Stripe
  from the student launch surface once CMI, virement, and cash-agency rails are
  wired end to end.
- Decision: model virement and CashPlus as pending/manual-confirmation rails,
  not instant checkout.
- Decision: model AshPlus or another cash-agency provider as the same type of
  pending/manual-confirmation rail unless its final integration contract proves
  it supports safe signed callbacks.
- Decision: entitlements are not granted from virement/CashPlus request
  creation. Entitlement grant requires finance confirmation or matched
  reconciliation.
- Decision: CMI will be the first instant provider rail, but this slice only
  creates the foundation unless existing code shape makes a safe CMI stub
  straightforward.
- Decision: expose the first foundation API at
  `POST /api/payments/payment-requests` instead of changing the existing Stripe
  checkout endpoint. This keeps current checkout stable and makes manual rails
  explicit.
- Decision: CMI returns a configured-not-ready error in this slice rather than
  creating fake CMI transactions. That avoids pretending an instant card rail is
  usable before callback signing and amount verification exist.
- Decision: virement/CashPlus request creation reuses one open
  `pending_manual_review` transaction per user, rail, and plan using
  `open_request_key`. This avoids duplicate pending references from retry,
  double-click, or scripted clients.
- Decision: unpaid Stripe verification is not cached as a terminal false result.
  The verification attempt is released so a later paid provider state can be
  checked again.

Verification plan:

- Backend payment tests.
- Startup/security config tests touched by payment settings.
- Secret/repo hygiene checks for new env names and docs.

Review notes addressed:

- Fixed manual payment request idempotency/reuse.
- Added DB check constraints for provider, rail, status, and currency fields.
- Added retry coverage for unpaid Stripe verification becoming paid later.

### Slice 2: Finance Review Bridge

Status: committed in `61f03515`.

Reason for this slice:

- Manual payment requests are only useful if staff can review them without
  touching the database directly.
- Approval must be the first point where access is granted for virement and
  CashPlus.
- Rejection must preserve audit history while allowing the student to create a
  clean replacement request.

Planned backend scope:

- Add staff-only list endpoint for manual payment transactions. Status:
  implemented.
- Add staff-only approve/reject endpoints. Status: implemented.
- On approval, mark the transaction paid, clear the open request key, write a
  provider-event row, write a finance-ledger row, and grant the current `is_pro`
  projection. Status: implemented.
- On rejection, mark the transaction failed, clear the open request key, write a
  provider-event row, write a finance-ledger row, and keep access locked.
  Status: implemented.

Decisions:

- Decision: use the existing `is_staff` plus verified-email guard for this
  bridge. Proper finance RBAC stays a later backoffice/security slice.
- Decision: use current `User.is_pro` as the entitlement projection for manual
  approval until the fuller entitlement model lands.
- Decision: keep the bridge backend-only for now. Dedicated admin UI comes
  after the core models and workflow contracts are stable.

Verification plan:

- Add route tests for non-staff denial and staff list access.
- Add approval tests for status, entitlement grant, idempotent repeat approval,
  provider-event audit, and ledger entry.
- Add rejection tests for no entitlement grant, retry creation, provider-event
  audit, and ledger entry.

Review notes addressed:

- Blocked staff self-approval of their own manual payment request.
- Blocked approval of expired manual payment requests.
- Expired pending manual requests now release their open request key so students
  can create a replacement request cleanly.
- Added an invalid status-filter regression test for the finance list endpoint.

### Slice 3: Exercise Bank Backend Skeleton

Status: committed in `3169961c`.

Reason for this slice:

- Exercise Bank is a separate workspace from Topic Workspace and quiz sets.
- Exercises need rich statement/solution bodies, optional images/diagrams, topic
  filtering, difficulty filtering, and student self-grade state.
- The backend contract should exist before UI cards/detail pages are wired.

Planned backend scope:

- Add first-class Exercise Bank tables separate from quizzes and TopicItem.
  Status: implemented.
- Add asset metadata for images, diagrams, graphs, and attachments. Status:
  implemented.
- Add current self-grade/progress storage with history JSON for later reveal and
  XP slices. Status: implemented as storage only.
- Add read-only list/detail API under `/api/exercises`. Status: implemented.
- Apply subject-level access and redact locked exercise detail bodies. Status:
  implemented.

Decisions:

- Decision: Exercise Bank exercises are not sourced from TopicItem curated
  exercises. They are separate records linked only to subject/topic for access
  and filtering.
- Decision: this slice stores self-grade state but does not yet implement reveal
  mutation, grade mutation, or XP awards.
- Decision: locked detail responses can return metadata/access state, but redact
  statement, solution, video URL, and assets.

Verification plan:

- Add model/migration declaration tests.
- Add list/filter tests for published exercises, difficulty, saved, and current
  self-grade.
- Add unlocked detail tests for statement, solution, video, assets, and
  self-grade history.
- Add locked detail tests for subject-access redaction.

Review notes addressed:

- Enforced Exercise Bank subject locks even for fresh users with no entitlement
  rows.
- Hidden exercises under unpublished subjects or unpublished topics.
- Redacted locked detail metadata in addition to bodies, video URLs, and assets.
- Fixed `saved=false` filtering to include untouched exercises with no progress
  row.

### Slice 4: Exercise Reveal, Self-Grade, and XP Guardrails

Status: committed in `4322a22b`.

Reason for this slice:

- Students need to reveal corrections, self-grade, and later filter by their
  current grade/history.
- Reveal delay is a frontend concern, but backend must persist reveal state.
- XP must be small, capped, and idempotent so self-grading cannot be farmed.

Planned backend scope:

- Add reveal mutation for accessible exercises. Status: implemented.
- Add self-grade mutation for `again`, `partial`, and `mastered`. Status:
  implemented.
- Append grade history and maintain current self-grade. Status: implemented.
- Award small one-time XP for first `mastered` grade per user/exercise. Status:
  implemented.

Decisions:

- Decision: reveal has no backend timer and grants no XP.
- Decision: self-grade history is student-reported; it is not correctness
  validation.
- Decision: only `mastered` gives XP, and only once per user/exercise through a
  user-scoped XP idempotency key.

Verification plan:

- Add reveal tests for count/timestamps and zero XP.
- Add locked mutation tests.
- Add self-grade tests for history and filterability.
- Add one-time mastery XP tests.
- Add invalid self-grade validation tests.

Review notes addressed:

- Self-grade mutations now require the correction to be revealed first.
- Direct `mastered` submissions before reveal do not grant XP.

### Slice 5: Exam Bank Part Capsules

Status: committed in `bd21e5b0`.

Reason for this slice:

- Exam problems need part-level enoncé and video correction, not only one
  problem-level statement/solution.
- The dedicated Exam Bank API should support the future capsule viewer without
  destabilizing the existing `/api/courses/exam-bank` compatibility route.

Planned backend scope:

- Add `ExamProblemPart` records under existing `ExamProblem`. Status:
  implemented.
- Store part label, statement/enoncé body, written correction body/file, video
  correction URL/resource, topic, difficulty, concepts, and metadata. Status:
  implemented.
- Add dedicated read API under `/api/exam-bank`. Status: implemented.
- Apply subject-level access and redact locked problem/part bodies, correction
  videos, resources, and metadata. Status: implemented.
- Support topic filtering when either the problem or one of its parts matches
  the topic. Status: implemented.

Decisions:

- Decision: keep existing `Exam` and `ExamProblem` as parents, and add
  `ExamProblemPart` as the new capsule layer.
- Decision: do not rewrite the legacy course Exam Bank route in this slice.
  The new part-capable API is separate so UI work can migrate deliberately.
- Decision: locked exam previews may expose exam/problem/part titles and counts,
  but not body, correction, video, resource URLs, or metadata.

Verification plan:

- Add model/migration declaration tests.
- Add entitled-list/detail tests for part order, enoncé, written correction, and
  video resources.
- Add part-topic filtering tests.
- Add locked-preview redaction tests.
- Add hidden-parent and draft-part tests.

Review notes addressed:

- Topic filters now ignore draft part-topic matches before exam/problem
  hydration.
- Problem-topic matches now return the full published part capsule instead of
  dropping sibling parts.
- Added regression coverage for both problem-topic and hidden part-topic filter
  cases.

### Slice 6: Quiz Snapshot and Version Integrity

Status: committed in `05b66fc8`.

Reason for this slice:

- Quiz attempts need to remain auditable when authors edit a question set after
  students have submitted answers.
- The grading payload used at submit time must be frozen with the attempt so XP,
  self-review, support, and future backoffice dispute handling can reconstruct
  what the student saw.
- This should stay server-side and not leak answers or snapshots through student
  attempt-history APIs.

Planned backend scope:

- Add snapshot JSON, hash, and schema-version fields to `QuizAttempt`. Status:
  implemented.
- Build deterministic snapshots from the exact question payload used for
  grading. Status: implemented.
- Persist the snapshot on new quiz attempts through the shared quiz submission
  service. Status: implemented.
- Keep duplicate submission behavior idempotent. Status: implemented by reusing
  the existing submission hash path.

Decisions:

- Decision: store snapshots on `QuizAttempt`, not on individual
  `QuestionAttempt`, because the integrity boundary is the full submitted quiz
  payload.
- Decision: include correct answers in the server-side snapshot because the
  snapshot is an audit record, but do not expose it through student attempt
  summaries.
- Decision: use a simple integer snapshot schema version plus SHA-256 hash over
  canonical JSON. This is sufficient for v1 and leaves room for future snapshot
  upgrades.

Verification plan:

- Add helper tests for deterministic snapshot hashing.
- Add submit-path regression coverage proving an attempt keeps the original
  snapshot after the source question is edited.
- Add a response-shape regression check that student attempt history does not
  expose snapshot fields.

Review notes addressed:

- Included the snapshot hash in the quiz submission idempotency key so a
  same-answer submission after a pass-score, tolerance, prompt, option, or
  answer edit creates a new versioned attempt instead of collapsing into the
  older attempt.
- Removed volatile `updated_at` from the snapshot hash input so metadata touch
  updates do not create unnecessary attempt versions.
- Added a migration guard for missing-table baselines.
- Expanded tests to cover exact duplicate retry, changed-version resubmit, and
  recursive absence of answer/snapshot keys in student attempt-history payloads.

## Next Candidate Slices

These may change after subagent reconnaissance.

1. XP economy caps and auditability.
2. Payment gateway completion: CMI signed callback flow, virement proof and
   reconciliation workflow, CashPlus/AshPlus cash-agency handling, and removal
   of Stripe from the launch checkout path.

## Open Risks

- The worktree contains a large accepted baseline. New commits must keep the
  scope clear so rollback is possible.
- Existing payment code and tests are Stripe-oriented. The first gateway slice
  must avoid a half-migration where both old and new flows grant access
  inconsistently.
- Manual payment rails require finance backoffice workflows; creating request
  rows without the review path is useful only if the state machine makes that
  limitation explicit.
