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

## Accepted TODO Direction

- Payment launch direction: remove Stripe from the target launch payment path.
  Stripe is legacy/current-state compatibility only until cutover.
- Implement the provider-neutral payment gateway around Moroccan rails:
  `cmi` for card payments, `bank_transfer`/virement for manual bank transfer,
  `cashplus` for cash-agency payment handling, and `ashplus` or equivalent
  cash-agency variants through the same reconciliation model.
- Required payment implementation scope: CMI initiation and signed callback
  verification, virement instructions/proof/reconciliation, CashPlus/AshPlus
  pending instructions/proof or provider-report import, finance approval,
  duplicate-safe reconciliation, append-only ledger entries, entitlement grants
  only after confirmed payment, finance backoffice views, support states, and
  end-to-end tests before the 10-day testing window.
- Do not add new Stripe features. Any remaining Stripe code should be treated
  as temporary compatibility until CMI, virement, and cash-agency rails are
  usable end to end.

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

### Slice 7: XP Economy Caps and Auditability

Status: implemented.

Reason for this slice:

- XP awards were idempotent, but not capped by daily economy category.
- Self-reported exercises, quiz question awards, lesson completion, and mutable
  quest rewards need central policy enforcement so XP cannot be farmed through
  many distinct valid events.
- XP history needs to explain when an award was clipped by policy.

Planned backend scope:

- Add an XP economy decision document. Status: implemented in
  `docs/xp-economy.md`.
- Add per-user, per-day, per-category cap usage storage. Status: implemented.
- Add requested amount, cap category/date, and cap-applied metadata to
  `XPTransaction`. Status: implemented.
- Enforce caps in the central XP service before totals, quests, or leaderboards
  can move. Status: implemented.
- Bound `amount_override` to explicit reasons and maximums. Status:
  implemented.

Decisions:

- Decision: cap by `active_date`, not raw transaction `created_at`.
- Decision: store capped-to-zero transactions for auditability; they do not
  update `UserXP`, quest progress, or leaderboard totals.
- Decision: keep negative XP/reversals out of this slice. They need a separate
  staff permission and adjustment workflow.
- Decision: keep reward values unchanged and only add caps around the current
  economy.

Verification plan:

- Add service tests for category caps, capped audit rows, per-user/per-day cap
  separation, and override bounds.
- Run XP, quiz, exercise, migration, and startup/security tests touched by XP
  models and migrations.

Review notes addressed:

- Insert XP transaction winners before daily-cap allocation so concurrent
  idempotency conflicts cannot consume cap capacity for rows that lose the
  insert race.
- Backfill `requested_amount` from existing `amount` values in the cap
  migration so historical XP history is not misleading.
- Align the data-integrity audit with the user-scoped XP idempotency model.
- Add cap-usage ledger drift checks comparing `xp_daily_cap_usage` against
  transaction sums and policy limits.

### Slice 8: CMI Payment Initiation

Status: implemented.

Reason for this slice:

- Stripe is not the launch checkout target, and the CMI card rail needs a real
  provider-neutral initiation path before callback processing can be tested.
- The existing payment request endpoint already accepts `cmi`, but previously
  returned a configured-not-ready error.
- CMI initiation can be added without granting access, which keeps the risky
  provider-confirmation boundary isolated for the next payment slice.

Planned backend scope:

- Route `POST /api/payments/payment-requests` through a provider dispatcher.
  Status: implemented.
- Keep virement and CashPlus on the existing `pending_manual_review` manual
  workflow. Status: preserved.
- Add CMI `pending_provider` transaction creation with unique order/reference
  codes, CMI form-post fields, and provider payload storage. Status:
  implemented.
- Require CMI client id, store key, payment URL, OK URL, fail URL, and callback
  URL before creating a CMI transaction, and reject unsafe CMI URLs before
  signing fields. Status: implemented.
- Keep access locked until a later signed CMI callback confirms the paid state.
  Status: implemented for initiation.

Decisions:

- Decision: CMI initiation returns signed form-post metadata under the existing
  payment request response `instructions` payload instead of adding a separate
  endpoint for v1.
- Decision: CMI uses its own `pending_provider` open request key
  `cmi:{user_id}:{plan}` so it cannot interfere with manual request reuse.
- Decision: CMI initiation stores provider payload data, including form fields
  and generated hash, but never stores or returns the CMI store key.
- Decision: CMI initiation uses `TranType=PreAuth` plus
  `CallbackResponse=true` so card authorization remains aligned with the future
  callback-confirmation state machine.
- Decision: CMI initiation rejects non-HTTPS, local/private, and non-CMI
  payment gateway URLs before returning signed form data to a student.
- Decision: callback signature validation, amount matching, duplicate provider
  event handling, and entitlement grant remain a separate slice.

Verification plan:

- Add payment-route tests for missing CMI config, configured CMI initiation,
  no access grant, provider payload storage, secret omission, and open request
  reuse.
- Add a deterministic CMI hash fixture test and unsafe URL rejection tests.
- Run targeted payment tests and startup/security checks touched by payment
  settings.

### Slice 9: CMI Signed Callback Processing

Status: implemented.

Reason for this slice:

- CMI initiation is useful only if the provider can call back into a verified,
  idempotent payment state machine.
- The app must not grant access from browser redirects or unsigned payloads.
- `TranType=PreAuth` requires returning the CMI post-authorization response only
  after local verification succeeds.

Planned backend scope:

- Add unauthenticated `POST /api/payments/cmi/callback` for provider form-post
  callbacks. Status: implemented.
- Exempt the CMI callback path from cookie CSRF checks while still requiring a
  valid CMI hash. Status: implemented.
- Verify CMI callback hash, client id, order/reference, amount, currency,
  provider success fields, and idempotent provider event id before granting
  access. Status: implemented.
- Mark verified approved callbacks as `paid`, append provider event and ledger
  entries, clear the open request key, and update the current `is_pro`
  projection. Status: implemented.
- Mark verified declined callbacks as `failed`, verified amount/currency/client
  mismatches as `mismatch`, and invalid hashes as failed provider events without
  granting access. Status: implemented.

Decisions:

- Decision: return `ACTION=POSTAUTH` only after a valid approved CMI callback
  matches a pending local transaction; otherwise return `FAILURE`.
- Decision: use `TransId`, then other provider references, as the CMI event
  idempotency key; invalid-hash callbacks use a separate payload digest so they
  cannot poison a later valid retry with the same provider transaction id.
- Decision: keep the callback route backend-only for now. Student success/fail
  pages remain a later minimal UI pass after the callback contract is stable.
- Decision: support the current ver3 sorted SHA-512 callback hash and the
  hash-params variant only when reconstructed from posted fields. Do not accept
  detached `HASHPARAMSVAL` signatures until a contracted CMI sandbox fixture
  proves the exact binding semantics.
- Decision: invalid-hash callbacks get a separate payload-digest event id so
  they cannot consume the real provider transaction id before a valid retry.
- Decision: once a CMI transaction is `paid`, later valid declined or mismatch
  callbacks are recorded as ignored events and cannot downgrade the payment.

Verification plan:

- Add tests for approved callback, duplicate replay, invalid hash, declined
  payment, amount mismatch, unknown order, paid-state downgrade prevention,
  invalid-hash replay, callback hash fixture, and CSRF exemption.
- Run payment, CSRF, startup/security, and secret-hygiene suites.

### Slice 10: Manual Payment Proofs and Reconciliation

Status: implemented.

Reason for this slice:

- Virement bancaire and CashPlus requests need student proof/receipt evidence
  without granting access from a student-provided value.
- Finance needs a duplicate-safe reference matching path before a full
  statement/report import UI exists.
- CashPlus and future AshPlus/cash-agency variants should share one manual
  evidence and reconciliation workflow unless a provider contract supplies a
  signed callback.

Planned backend scope:

- Add queryable payment-proof evidence records for manual payment transactions.
  Status: implemented as `payment_transaction_proofs`.
- Add student proof submission for own pending manual payment requests. Status:
  implemented.
- Keep proof submission as evidence only; do not grant access or write ledger
  confirmation from proof alone. Status: implemented.
- Add staff reconciliation by rail, app reference code, amount, and provider
  reference. Status: implemented.
- Mark exact reconciliations as `paid`, append provider event and ledger
  entries, clear the open request key, and update the current `is_pro`
  projection. Status: implemented.
- Mark wrong-amount reconciliations as `mismatch`, append provider event and
  ledger entries, and keep access locked. Status: implemented.

Decisions:

- Decision: use a first-class `payment_transaction_proofs` table instead of
  storing proof evidence only inside `PaymentTransaction.metadata_json`.
- Decision: proof submission records an immutable provider-event style
  `manual.proof_submitted` event with status `received`, not a finance ledger
  entry.
- Decision: duplicate proof submissions are de-duplicated by a stable proof
  digest per transaction.
- Decision: staff reconciliation is row-level/manual for v1. Bulk
  `reconciliation_imports` and imported row tables remain a later slice once
  the CSV/report formats are known.
- Decision: reconciliation idempotency consumes the external provider reference
  for the rail, not the app reference code. Reusing the same CashPlus/bank
  provider reference against another app transaction returns the existing
  reconciled transaction and cannot unlock a second student.
- Decision: `cashplus` remains the concrete cash-agency rail for now. AshPlus
  should reuse this manual/cash reconciliation model unless its provider
  contract gives us signed callbacks or a distinct required identifier scheme.

Verification plan:

- Add model and migration declaration tests for the proof table.
- Add proof submission tests for ownership, duplicate evidence, no ledger, and
  no access grant.
- Add reconciliation tests for exact match, duplicate import idempotency,
  amount mismatch, mismatch filtering, ledger events, and access projection.
- Run payment, schema-limit, CSRF, startup/security, secret-hygiene, and compile
  checks.

### Slice 11: AshPlus Cash-Agency Rail

Status: implemented.

Reason for this slice:

- The launch payment gateway plan includes AshPlus or equivalent cash-agency
  handling in addition to CashPlus.
- AshPlus should not become a one-off payment system; it needs the same pending,
  proof, reconciliation, ledger, and entitlement guardrails as CashPlus.
- Finance still needs to distinguish provider reports by rail, so a first-class
  `ashplus` rail/provider is cleaner than silently aliasing it to `cashplus`.

Planned backend scope:

- Add `ashplus` provider and rail constants. Status: implemented.
- Widen payment transaction, provider event, and payment proof constraints to
  accept `ashplus`. Status: implemented.
- Accept `payment_method=ashplus` through the existing payment request API.
  Status: implemented.
- Reuse the manual proof and reconciliation workflow for AshPlus. Status:
  implemented.
- Keep access locked until finance reconciliation or manual approval. Status:
  implemented.

Decisions:

- Decision: AshPlus is a separate rail/provider from CashPlus for filtering,
  reconciliation reports, and future provider-specific fields, but it shares
  the exact same manual cash-agency state machine.
- Decision: AshPlus references use `KRESCO-ASH-*` so support/finance can
  distinguish them from `KRESCO-CASH-*` CashPlus references at a glance.
- Decision: no AshPlus-specific callback endpoint exists until a signed
  provider contract proves one is available and safe.

Verification plan:

- Add model/migration declaration coverage for the widened constraints.
- Add AshPlus request tests proving pending state, provider/rail values,
  reference prefix, and no access grant on request creation.
- Add AshPlus proof plus reconciliation tests proving proof alone does not
  unlock access, reconciliation does, and ledger/provider events use the
  AshPlus rail.

## Next Candidate Slices

These may change after subagent reconnaissance.

### Slice 12: Manual Payment Reconciliation Imports

Status: implemented.

Reason for this slice:

- Row-level reconciliation is not enough for finance operations; staff need to
  import normalized bank/CashPlus/AshPlus report rows in batches.
- Importing must still use the same duplicate-safe payment state machine as
  manual reconciliation.
- CSV/file parsing can remain UI/backoffice work later; the backend needs a
  stable JSON contract and durable import/row audit trail now.

Planned backend scope:

- Add reconciliation import and imported row audit tables. Status: implemented.
- Add a staff-only JSON import endpoint for normalized manual payment rows.
  Status: implemented.
- Process each row through the existing manual reconciliation state machine.
  Status: implemented.
- Persist row-level status as `matched`, `mismatch`, `unmatched`, `duplicate`,
  or `error`. Status: implemented.
- Keep duplicates from inflating matched counts or writing extra ledger rows.
  Status: implemented.

Decisions:

- Decision: v1 import accepts normalized JSON rows instead of raw CSV upload.
  This avoids locking the backend to an unknown bank/CashPlus/AshPlus file
  format while still giving finance a durable contract.
- Decision: import rows are immutable audit rows. Payment side effects still go
  through the existing reconciliation service so amount checks, external
  provider-reference idempotency, ledger entries, and entitlement projection
  stay centralized.
- Decision: an already-processed provider reference is reported as an import
  row `duplicate`, not as another `matched` row.
- Decision: imported rows are first inserted as `error` audit placeholders
  before payment side effects. If row processing fails unexpectedly, the import
  keeps a durable error row instead of silently committing money/access changes
  without row audit.
- Decision: a new provider reference pointed at a terminal paid/failed/mismatch
  manual transaction is consumed as a duplicate provider event and rejected, so
  it cannot later be reused to unlock another pending payment.

Verification plan:

- Add model/migration declaration tests for import and row tables.
- Add batch import tests covering matched, mismatch, unmatched, and duplicate
  rows in one import.
- Add regression tests for terminal-transaction duplicate provider references
  and unexpected row-processing failures.
- Add student-denial tests for the staff-only import endpoint.
- Run payment, migration, schema-limit, CSRF, startup/security,
  secret-hygiene, compile, and diff checks.

## Next Candidate Slices

These may change after subagent reconnaissance.

1. Payment gateway completion: minimal payment UI states and removal of Stripe
   from the launch checkout path.

### Slice 13: Provider-Neutral Pricing Payment UI

Status: implemented.

Reason for this slice:

- The backend now supports CMI, virement bancaire, CashPlus, and AshPlus rails,
  but the visible pricing page still starts with the legacy Stripe checkout
  helper.
- The user asked to keep UI choices minimal until a later UI pass, so this
  slice should change only the launch-facing payment behavior and keep the
  existing pricing layout coherent.

Planned frontend scope:

- Add a provider-neutral payment request client for `POST /payments/payment-requests`.
  Status: implemented.
- Keep the old Stripe checkout helper only as compatibility code; do not use it
  from the visible pricing page. Status: implemented.
- Add a compact payment-method selector for CMI, virement, CashPlus, and
  AshPlus on the existing pricing card. Status: implemented.
- For CMI, submit the signed provider form returned by the backend. Status:
  implemented.
- Allow CMI form POSTs through CSP with a narrow `form-action` CMI host
  allowance. Status: implemented.
- For manual rails, show the pending payment reference and instructions instead
  of redirecting or marking access active. Status: implemented.

Decisions:

- Decision: the first launch UI slice stays inside `/pricing` instead of adding
  a new checkout route. That keeps the product surface small until the dedicated
  UI pass.
- Decision: CMI uses backend-returned form-post metadata directly. The frontend
  does not calculate hashes or store CMI secrets.
- Decision: CSP allows form submissions only to `self`, `https://cmi.co.ma`,
  and `https://*.cmi.co.ma` for the CMI provider post. Do not broaden
  `form-action` to arbitrary HTTPS payment hosts.
- Decision: virement, CashPlus, and AshPlus produce a visible pending state with
  reference and amount. Access remains locked until finance/provider
  confirmation.
- Decision: legacy Stripe verification/success compatibility remains for now so
  old routes/tests can be migrated deliberately later, but no new pricing UI
  depends on Stripe checkout.

Verification plan:

- Add frontend unit tests for CMI form-post metadata, manual pending requests,
  missing CMI metadata, and hidden form submission. Status: implemented.
- Add pricing-page tests for CMI form submission and manual pending-state
  rendering. Status: implemented.
- Replace the fake-Stripe purchase integration smoke with a provider-neutral
  CashPlus pending-payment smoke. Status: implemented.
- Run targeted frontend payment tests, pricing tests, proxy tests, lint, and
  TypeScript checks. Status: implemented.
- Add proxy CSP coverage for the CMI `form-action` allowance. Status:
  implemented.
- Browser smoke note: a standalone frontend dev server redirects `/pricing` to
  `/` without authenticated backend session state, so rendered pricing behavior
  is verified through the focused jsdom page test in this slice.
- Use a strong review subagent before committing this slice. Status:
  implemented; initial CSP finding was fixed and follow-up review found no new
  high/medium issues.

### Slice 14: CMI Return Pages

Status: implemented.

Reason for this slice:

- Backend CMI settings point to `/payment/cmi/ok` and `/payment/cmi/fail`, but
  the frontend did not yet own those return routes.
- The return pages should not trust browser query params or provider redirects
  to grant access; only the signed backend callback and profile projection
  should determine whether access is active.

Planned frontend scope:

- Add minimal authenticated CMI OK and fail pages. Status: implemented.
- On OK, refresh the current profile and show active access only if `is_pro` is
  already projected by the backend. Status: implemented.
- If the OK page arrives before projection, show a pending confirmation state
  instead of granting access. Status: implemented.
- On fail, show a retry/pricing path without calling profile refresh. Status:
  implemented.
- Protect `/payment/cmi/*` at the proxy auth boundary, matching the existing
  `/payment-success` behavior. Status: implemented.

Decisions:

- Decision: do not parse or trust CMI return query parameters in the frontend.
  The frontend display follows `/profile/me`; the backend signed callback
  remains the only source of payment truth.
- Decision: keep the pages under `/payment/cmi/ok` and `/payment/cmi/fail`
  because those are the backend CMI setting paths already used in tests.
- Decision: use a shared small return-status component instead of duplicating
  page state logic between OK and fail routes.
- Decision: do not wrap the CMI return component in client `AuthGuard`; proxy
  auth protection plus one explicit profile refresh avoids racing two
  independent `/profile/me` reads.
- Decision: the pending-state `Actualiser` action reruns the profile check
  directly instead of relying on `router.refresh()`.

Verification plan:

- Add jsdom tests for confirmed active access, pending confirmation, and failed
  CMI return behavior. Status: implemented.
- Add tests for proxy protection and pending-state refresh. Status:
  implemented.
- Run targeted CMI return-page tests, TypeScript checks, and lint. Status:
  implemented.
- Browser smoke note: routes are authenticated and profile-dependent, so this
  slice is verified through focused component/page tests instead of a standalone
  unauthenticated browser screenshot.
- Strong review found proxy-auth, duplicate profile-refresh, and refresh-action
  issues; all were fixed, and follow-up review found no new high/medium issues.

### Slice 15: Manual Payment Proof Submission UI

Status: implemented.

Reason for this slice:

- The backend already supports student proof submission for virement, CashPlus,
  and AshPlus, but the pricing pending-payment panel only showed instructions.
- Students need a minimal way to submit receipt/reference metadata while access
  remains locked until finance/provider confirmation.

Planned frontend scope:

- Add a manual payment proof client for
  `POST /payments/manual-payment-requests/{transaction_id}/proof`. Status:
  implemented.
- Add a compact proof form inside the existing manual pending-payment panel.
  Status: implemented.
- Require at least a receipt/reference or proof URL in the UI. Status:
  implemented.
- Keep proof submission as pending/manual review; do not mutate `is_pro`.
  Status: implemented.

Decisions:

- Decision: v1 proof submission accepts receipt/reference text and optional
  proof URL, payer name, and notes. It does not upload files because the backend
  proof contract is JSON metadata, not multipart media.
- Decision: proof kind is generated from the selected manual rail, e.g.
  `cashplus_receipt`, so finance can filter proof context without student
  choosing internal labels.
- Decision: after proof submission, the student sees a submitted state, but
  access remains controlled by finance approval or reconciliation.

Verification plan:

- Add helper tests for normalized proof payloads and backend error handling.
  Status: implemented.
- Add pricing-page tests proving proof submission calls the manual proof helper
  and leaves `is_pro=false`, including blank-submit rejection and URL-only
  proof acceptance. Status: implemented.
- Extend the provider-neutral purchase e2e smoke to submit CashPlus proof and
  assert the response remains `pending_manual_review`. Status: implemented.
- Run targeted proof/pricing tests, TypeScript checks, and lint. Status:
  implemented.
- Strong review found no blocking issues. It requested URL-only and blank-proof
  UI coverage; both tests were added. Status: implemented.
- The targeted integration e2e build passed, but the Playwright web server did
  not start because the existing backend e2e seed imports missing
  `app.routers.users._hash_password`. Status: blocked by unrelated baseline.

### Slice 16: Shared Course Discovery Data Cache

Status: implemented.

Reason for this slice:

- Exercise and Exam Bank browsing needs aggressive client caching so returning
  from detail/list surfaces does not feel like a full reload.
- The existing course list, Exam Bank page, and admin course list each owned
  their own fetch/loading/error loop, which would make later bank filters and
  locked previews harder to keep consistent.

Planned frontend scope:

- Add a shared `courseDiscoveryData` module for course topics, Exam Bank, and
  admin subject discovery. Status: implemented.
- Move the student Courses page to shared SWR-backed topic loading while keeping
  current filter URL behavior. Status: implemented.
- Move the Exam Bank page to shared SWR-backed loading while preserving query
  sync and locked-preview behavior. Status: implemented.
- Move the admin course list to shared SWR-backed subject loading and retry.
  Status: implemented.

Decisions:

- Decision: keep this as a data/cache foundation rather than a visual redesign.
  The next UI pass can replace the card presentation without changing the data
  hooks.
- Decision: keep route query state in each page, but centralize API keys and
  stale-data behavior in the shared hook module.
- Decision: do not include the separate admin new-course contract cleanup in
  this slice; it needs its own validation and commit.

Verification plan:

- Run the focused Exam Bank page, admin course list, admin cached-state, admin
  subject page, and admin new-course tests. Status: implemented.
- Run TypeScript checks and lint. Status: implemented.
- Strong review found one cached-data regression in the admin course list; the
  list now remains visible when a background SWR refresh fails, with direct
  regression coverage. Status: implemented.

### Slice 17: Admin Course Creation Contract Cleanup

Status: implemented.

Reason for this slice:

- The backend `SubjectCreateIn` strict input accepts `title` and `description`.
  The admin new-course page still submitted unsupported `niveau` and `filiere`
  fields, which can make subject creation fail under strict payload validation.
- The admin subject detail page also displayed removed track fields instead of
  the actual subject detail contract.

Planned frontend scope:

- Remove unsupported `niveau` and `filiere` fields from the admin new-course
  subject creation payload. Status: implemented.
- Keep the new-course flow to subject plus ordered topic creation only. Status:
  implemented.
- Update the admin subject detail page to render subject description and typed
  topic/workspace data instead of track fields. Status: implemented.
- Keep the UI minimal and compatible with the current dark admin surface.
  Status: implemented.

Decisions:

- Decision: program track assignment remains outside subject creation for now.
  The subject model and create endpoint are not the same thing as a
  `ProgramTrack`.
- Decision: keep ASCII-only French copy in touched admin files to match the
  current repository editing constraint.
- Decision: do not include broader backend course router changes in this slice;
  only validate against the existing strict contract.

Verification plan:

- Run frontend admin new-course and admin subject-page tests. Status:
  implemented.
- Run backend staff-only course catalog mutation test. Status: implemented.
- Run TypeScript checks and lint. Status: implemented.
- Strong review found no blocking issues and confirmed the staged file set is
  limited to this admin contract cleanup. Status: implemented.

### Slice 18: User-Bound Topic Item Stream Tokens

Status: implemented.

Reason for this slice:

- VdoCipher stream OTPs already support per-user cache keys and provider
  payload binding, but the topic-item stream route did not pass the current
  user id into the stream helper.
- Video access is entitlement-protected, so generated stream tokens should stay
  scoped to the authenticated viewer where the provider supports that metadata.

Planned backend scope:

- Pass the authenticated `user.id` from
  `GET /courses/topic-items/{item_id}/stream` into `get_video_stream_data`.
  Status: implemented.
- Update the VdoCipher video stream helper to accept a keyword-only `user_id`,
  include it in the OTP provider payload, and cache OTPs per provider base URL,
  video id, and user id. Status: implemented.
- Add route-level regression coverage proving the stream helper receives the
  authenticated user id. Status: implemented.
- Add service-level regression coverage proving the helper accepts `user_id`,
  binds the provider payload, and does not reuse the same OTP cache entry
  across different users. Status: implemented.

Decisions:

- Decision: this slice does not change entitlement checks or stream response
  shape. It only binds the provider request/caching context to the existing
  authenticated user.
- Decision: keep the route-level test separate from the large dirty course
  access test file so this commit stays narrow.

Verification plan:

- Run the new course stream user-binding route test. Status: implemented.
- Run the existing VdoCipher per-user stream-cache service test. Status:
  implemented.
- Strong review initially found the missing helper signature in the staged set;
  after adding the helper contract and service test, the follow-up review found
  no blocking issues. Status: implemented.

### Slice 19: Exercise Bank Student Workspace

Status: implemented.

Reason for this slice:

- The Exercise Bank backend already had subject-scoped browsing, detail,
  reveal, self-grade, grade history, locked redaction, and XP guardrails.
- The product decision was that exercises are their own workspace, not a Topic
  Workspace tab and not the same model as curated topic-flow exercises.
- The immediate UI goal is coherence and usability, not final visual polish.

Planned frontend scope:

- Add a dedicated authenticated `/exercise-bank` student page. Status:
  implemented.
- Derive subject selector cards from the existing course-topic discovery data
  so the page stays subject-first without adding a new subject API. Status:
  implemented.
- Add bank-local filters for difficulty, current self-grade, and saved-only.
  Status: implemented.
- Use current self-grade as the primary card status and keep difficulty as
  separate bar metadata. Status: implemented.
- Add full-page exercise detail with statement first, hidden correction, reveal
  mutation, and self-grade buttons only after reveal. Status: implemented.
- Add the Exercise Bank entry to the existing student navigation. Status:
  implemented.

Decisions:

- Decision: keep this as a standalone Exercise Bank workspace under
  `/exercise-bank`, not a Topic Workspace tab.
- Decision: derive subjects from `/courses/topics` for v1 rather than adding a
  new discovery endpoint, because the existing shared cache already powers
  student course/exam discovery.
- Decision: keep correction below the statement and avoid split-view layout for
  v1 so long LaTeX/diagram bodies work on mobile.
- Decision: use the mutation response to update the local SWR detail cache,
  because page-level SWR providers do not reliably receive global cache
  mutations in tests.
- Decision: update the local subject-list cache after self-grade so card status
  reflects the student's latest grade immediately when returning from detail.
- Decision: comments/notes stay out of this slice because the backend does not
  yet expose an exercise comment/note mutation contract.

Verification plan:

- Add a frontend test covering subject-scoped list loading, filter URL sync,
  detail opening, correction reveal, self-grade submission, and card-status
  refresh after returning to the list. Status: implemented.
- Add regression coverage for stale detail/list data when switching exercises
  or filters while the new request is still loading. Status: implemented.
- Run the focused Exercise Bank page test. Status: implemented.
- Run the TopNav accessibility test after adding the Exercise Bank nav item.
  Status: implemented.
- Run TypeScript checks. Status: implemented.
- Run lint before committing. Status: implemented.
- Browser smoke decision: skip anonymous dev-server screenshot for this slice
  because `/exercise-bank` is inside the dashboard `AuthGuard`; the jsdom page
  test mocks authenticated API state and covers the core UI flow. Status:
  implemented.
- Strong review found stale SWR detail/list issues before commit; both were
  fixed by removing cross-key previous data and adding regression coverage.
  Follow-up review found no findings and confirmed the staged scope. Status:
  implemented.

### Slice 20: Exam Bank Problem Detail View

Status: implemented.

Reason for this slice:

- The Exam Bank backend already exposes `/api/exam-bank/problems/{problem_id}`
  with problem-level metadata and part capsules.
- The student Exam Bank page only listed grouped problem cards, so students
  could not open the enonce/correction capsule view that matches the exam
  problem model.

Planned frontend scope:

- Add an Exam Bank problem detail hook using the existing detail endpoint.
  Status: implemented.
- Add URL-driven detail state with `problem=<id>` so students can open a
  problem and return to the filtered exam list. Status: implemented.
- Render problem statement and written correction in a full-page detail view.
  Status: implemented.
- Render part capsules with video correction above the enonce and written
  correction below, matching the product decision for exam problems. Status:
  implemented.
- Keep locked problem details redacted and send the unlock CTA to pricing.
  Status: implemented.

Decisions:

- Decision: reuse the existing `ExamBankProblemDetailOut` contract instead of
  adding a new frontend-specific endpoint.
- Decision: keep activity/progress tracking out of this slice because no
  backend exam-problem progress contract exists yet.
- Decision: keep rendering as text-preserving blocks for now; final LaTeX/media
  polish belongs to the later UI pass.
- Decision: use a fresh detail cache key on each problem open and hide detail
  during revalidation because exam problem bodies are access-sensitive.
- Decision: track the detail request version separately from the URL state so a
  local open fetches once, while back/deep-link route changes still force a
  fresh detail request.

Verification plan:

- Add a page test proving a listed problem opens the detail endpoint and renders
  a part enonce, written correction, and video correction link. Status:
  implemented.
- Add regression coverage for resource-only video corrections, locked
  part-level redaction, and cached unlocked detail suppression while a fresh
  detail request is pending. Status: implemented.
- Run the focused Exam Bank page test. Status: implemented.
- Run TypeScript checks and lint. Status: implemented.
- Strong review found resource-video, part-lock, and access-sensitive cache
  issues before commit; all were fixed and covered by tests. Follow-up review
  found one duplicate-fetch issue, which was fixed with route-version tracking.
  Status: implemented.

### Slice 21: Exam Bank Problem Progress Tracking

Status: implemented.

Reason for this slice:

- The 10-day test plan calls out Exam Bank attempt/completion state.
- Exam problem detail now exists, but students still needed a persistent opened,
  completed, and saved state for later filters and revision workflows.

Planned backend scope:

- Add `user_exam_problem_progress` storage keyed by user and exam problem.
  Status: implemented.
- Add progress fields to Exam Bank problem list/detail payloads. Status:
  implemented.
- Add an explicit `POST /exam-bank/problems/{problem_id}/progress` mutation.
  Status: implemented.
- Enforce subject access before progress mutations. Status: implemented.

Planned frontend scope:

- Record `opened` when an accessible problem detail is loaded. Status:
  implemented.
- Add minimal Save and Mark completed controls to the Exam Bank problem detail
  page. Status: implemented.
- Update the local detail cache from the mutation result. Status: implemented.

Decisions:

- Decision: use an explicit POST mutation instead of recording progress inside
  the GET detail endpoint so read requests stay side-effect-free.
- Decision: do not award XP in this slice; exam progress is storage for filters,
  revision, and later XP rules.
- Decision: `completed` is sticky. A later `opened` event does not downgrade a
  completed problem.
- Decision: enforce sticky completion with an atomic conditional SQL update so
  stale concurrent `opened` requests cannot overwrite a committed `completed`
  state.
- Decision: keep `saved` on the exam-progress row for v1 rather than wiring the
  generic saved-items table into this flow.

Verification plan:

- Add backend tests for model/migration declaration, opened/saved/completed
  transitions, list/detail projection, sticky completion, and locked mutation
  rejection. Status: implemented.
- Add a stale-session regression test for opened-vs-completed races. Status:
  implemented.
- Add frontend tests proving detail open records progress and Save/Mark
  completed call the progress endpoint and update UI state. Status:
  implemented.
- Run focused backend Exam Bank tests. Status: implemented.
- Run focused frontend Exam Bank tests, TypeScript checks, and lint. Status:
  implemented.
- Strong review found a concurrent opened-vs-completed downgrade risk; the
  mutation now uses an atomic conditional update and has stale-session coverage.
  Follow-up review found no findings. Status: implemented.

### Slice 22: Exam Bank Revision Filters

Status: implemented.

Reason for this slice:

- Exam Bank progress and saved state existed, but the student browsing surface
  still could not filter by those fields.
- The revision workflow needs saved/completed/not-started filtering inside each
  bank before a unified revision queue is introduced.
- The student list was still using the legacy `/courses/exam-bank` list route,
  which did not expose the dedicated part-capable Exam Bank response contract.

Planned backend scope:

- Add `progress_status` and `saved` filters to `GET /api/exam-bank`. Status:
  implemented.
- Apply filters at problem level and drop exam groups with no matching
  problems. Status: implemented.
- Keep `not_started` and `saved=false` inclusive of untouched problems with no
  progress row. Status: implemented.
- Reject invalid progress filter values at the route boundary. Status:
  implemented.

Planned frontend scope:

- Move the Exam Bank list hook from the legacy `/courses/exam-bank` route to
  the dedicated `/exam-bank` list contract. Status: implemented.
- Add minimal URL-backed filters for progress and saved-only state. Status:
  implemented.
- Show current progress and saved badges on problem cards. Status:
  implemented.

Decisions:

- Decision: the student Exam Bank browse UI should use the dedicated
  `/exam-bank` API now that detail, parts, progress, and filters live there.
- Decision: keep the revision queue as bank-local filters for now, matching the
  product decision to defer a unified queue.
- Decision: treat untouched progress rows as `not_started` and unsaved, so
  filters work before a student has opened every problem.
- Decision: keep the filter UI deliberately compact because a dedicated UI pass
  is planned later.

Verification plan:

- Add backend tests for completed, saved, not-started, saved=false, and invalid
  progress filters. Status: implemented.
- Add frontend tests for the new list response shape, progress filter URL/API
  sync, saved-only URL/API sync, and existing detail/progress behavior. Status:
  implemented.
- Run focused backend Exam Bank tests. Status: implemented.
- Run focused frontend Exam Bank tests and TypeScript checks. Status:
  implemented.
- Run lint and strong review before committing this slice. Status:
  implemented.
- Strong review found missing `saved=false` URL/API support in the student UI
  and stale not-started list cache after auto-open. Both were fixed with a
  tri-state saved filter, `saved=false` SWR keys, and list revalidation after
  opened progress writes. Status: implemented.

### Slice 23: Exercise Bank Save Toggle

Status: implemented.

Reason for this slice:

- Exercise Bank already stored `saved` state and exposed saved filters, but
  students could not toggle saved state from the bank UI.
- Saved exercises are part of the bank-local revision workflow and should not
  require the future unified revision queue.

Planned backend scope:

- Add a subject-access-checked save/unsave mutation for Exercise Bank
  exercises. Status: implemented.
- Persist saved state on the existing `user_exercise_progress` row. Status:
  implemented.
- Keep save/unsave free of XP side effects. Status: implemented.
- Keep locked subject exercises blocked from save mutations. Status:
  implemented.

Planned frontend scope:

- Add a compact Save/Saved control in Exercise Detail. Status: implemented.
- Update detail and current list caches after save/unsave. Status:
  implemented.
- Show saved state on exercise cards so returning to the list reflects the
  current revision marker. Status: implemented.

Decisions:

- Decision: saved state stays on `UserExerciseProgress` for Exercise Bank v1,
  matching the existing saved filters and avoiding a second generic saved-item
  write path for this bank.
- Decision: saving an exercise requires subject access, consistent with reveal
  and self-grade mutations.
- Decision: save/unsave does not award XP.

Verification plan:

- Add backend tests for save, unsave, saved filters, no XP, and locked mutation
  rejection. Status: implemented.
- Add frontend tests for the detail save button, API payload, toast, and list
  card update after returning. Status: implemented.
- Run focused backend Exercise Bank tests, frontend Exercise Bank page tests,
  TypeScript checks, lint, and strong review before committing. Status:
  implemented.
- Strong review found a saved-only cache issue when unsaving an exercise from
  an active saved filter. The current list now removes that exercise and
  decrements the count, with regression coverage. Status: implemented.

### Slice 24: Exercise Bank Private Notes

Status: implemented.

Reason for this slice:

- Exercise Detail payloads already exposed `notes`, but there was no mutation
  contract or student UI to save revision notes.
- The product discussion wanted comments/notes separated from the main exercise
  flow. Private notes are the simplest v1 implementation and avoid public
  moderation/threading scope.

Planned backend scope:

- Add a subject-access-checked notes mutation for Exercise Bank exercises.
  Status: implemented.
- Store notes on the existing `user_exercise_progress.notes` field. Status:
  implemented.
- Bound the input with the existing `LongText` schema limit and forbid
  unexpected request fields. Status: implemented.
- Keep notes free of XP side effects. Status: implemented.

Planned frontend scope:

- Add a compact private-notes section in Exercise Detail. Status: implemented.
- Save notes through the new Exercise Bank notes mutation. Status:
  implemented.
- Update the local detail cache after save. Status: implemented.

Decisions:

- Decision: implement private per-student notes for v1, not public comments.
  Public Exercise Bank comments need moderation, threading, and visibility
  rules and should be a separate slice.
- Decision: saving notes requires subject access, consistent with reveal,
  self-grade, and saved-state mutations.
- Decision: notes do not award XP.

Verification plan:

- Add backend tests for notes save, trimming, detail projection, clear, no XP,
  locked mutation rejection, and free-preview rejection. Status: implemented.
- Add frontend tests for editing notes, API payload, and success feedback.
  Status: implemented.
- Run focused backend Exercise Bank tests, frontend Exercise Bank page tests,
  TypeScript checks, lint, py_compile, and strong review before committing.
  Status: implemented.
- Strong review found that free-preview access still allowed notes despite the
  subject-access decision, and that note drafts could be overwritten by detail
  revalidation. Notes now require active subject access; dirty note drafts are
  preserved across same-exercise refreshes, while clean drafts still sync from
  refreshed server notes. Status: implemented.

### Slice 25: Quiz Mistake Notebook Foundation

Status: implemented.

Reason for this slice:

- The quiz roadmap needs a revision queue for questions students previously
  missed, but the UI can stay minimal until the final design pass.
- `QuestionAttempt` already records the submitted answer, expected answer,
  correctness, grading payload, and subject/topic context, so the simplest
  correct model is a projection from official quiz submissions rather than a
  separate student-entered mistake system.

Planned backend scope:

- Add `mistake_notebook_entries`, one entry per `(user, question)`. Status:
  implemented.
- Create/update entries from freshly inserted quiz `QuestionAttempt` rows.
  Status: implemented.
- Keep duplicate quiz submissions from mutating mistake counts. Status:
  implemented.
- Add a student-scoped read API with status, subject, topic, limit, and offset
  filters. Status: implemented.
- Avoid XP awards and review-completion writes in this foundation slice.
  Status: implemented.

Decisions:

- Decision: notebook entries are derived only from submitted quiz attempts, not
  manually recorded by students.
- Decision: an incorrect attempt opens/reopens the entry and increments
  `mistake_count`; a later correct attempt marks an existing entry `corrected`
  and increments `corrected_count`.
- Decision: do not create entries for questions a student gets correct on the
  first attempt.
- Decision: use one projection row per `(user, question)` so future revision
  filters can work without scanning all historical attempts.
- Decision: expose only a read API in this slice. Review actions, XP rewards,
  and notebook UI are separate slices.
- Decision: the student-facing notebook API exposes the student's last answer
  and question metadata, but not `correct_answer_json` or raw grading payloads.
  Those fields stay internal to avoid leaking answer keys before a deliberate
  correction/review flow exists.
- Decision: `corrected_count` counts transitions from `open` to `corrected`,
  not every later correct submission while the entry is already corrected.

Verification plan:

- Add focused tests for quiz-derived open/corrected transitions, duplicate
  submission idempotency, student scoping, migration declarations, and model
  constraints. Status: implemented.
- Run focused mistake notebook tests and compile checks. Status: implemented.
- Run adjacent quiz/gamification tests and strong review before committing.
  Status: implemented.
- Strong review found answer-key exposure risk, repeated-correct count
  inflation, stale context on correction, and unrelated dirty-scope risk. The
  API no longer returns correct answers or raw grading payloads; correction
  counts only transition from open to corrected; correction refreshes context;
  staging will be scoped hunks only. Status: implemented.

### Slice 26: Quiz Attempt History API

Status: implemented.

Reason for this slice:

- Students need quiz attempt history before a useful quiz/revision workspace
  can exist.
- The platform already persists `QuizAttempt` and `QuestionAttempt`, but the
  standalone quiz API did not expose a safe attempt-history contract.

Planned backend scope:

- Add a student-scoped `GET /api/quizzes/{question_set_id}/attempts` endpoint.
  Status: implemented.
- Reuse existing question-set access checks before exposing attempts. Status:
  implemented.
- Return score, pass state, attempt number, duration, submission time, and
  per-question correct/answered flags. Status: implemented.
- Exclude raw answers, expected answers, raw grading payloads, and quiz
  snapshots from the response. Status: implemented.

Decisions:

- Decision: attempt history requires current access to the question set. Past
  attempts are not exposed after the student loses access in this slice.
- Decision: the response is a safe read model, not a replay/debug payload. It
  intentionally omits `answers`, `correct_answer_json`, `expected`, and
  `question_snapshot_json`.
- Decision: pagination is bounded by FastAPI validation (`limit` 1-50,
  nonnegative `offset`) instead of silent clamping.
- Decision: no frontend screen is added in this slice; UI can consume the
  endpoint after the design pass.

Verification plan:

- Add backend tests for student scoping, newest-first ordering, safe
  per-question result shape, answer-key non-leakage, access blocking, and query
  bounds. Status: implemented.
- Run focused quiz attempt history tests, mistake notebook tests, quiz grading
  tests, Topic Workspace quiz tests, and compile checks. Status: implemented.
- Run strong review before committing. Status: implemented.
- Strong review found real standalone submissions could report missing question
  types as `multiple_choice` because the legacy submit grading omitted safe
  `type` and `answered` fields. The submit path now stores those safe fields,
  and route-level regression coverage verifies history after an actual
  submission. Status: implemented.

### Slice 27: First Perfect Quiz XP

Status: implemented.

Reason for this slice:

- `quiz_perfect` existed in the XP reward table and daily cap mapping, but no
  official quiz submission path awarded it.
- The product TODO explicitly calls out unused rewards that should be wired or
  removed. Perfect quiz is low-risk to wire because the shared quiz submission
  service already owns backend-graded correctness and idempotency.

Planned backend scope:

- Award `quiz_perfect` from the shared quiz submission service when an official
  submission is passed, has exactly one inserted question attempt per snapshot
  question, score equals `100`, and every inserted question attempt is correct.
  Status: implemented.
- Deduplicate the reward per `(user, question_set)`. Status: implemented.
- Keep the reward in the existing `quiz_pass` daily cap category. Status:
  implemented.
- Avoid UI changes in this slice. Status: implemented.

Decisions:

- Decision: `quiz_perfect` means the first perfect submission a student
  achieves for a question set, not only a perfect first attempt and not every
  later perfect retry.
- Decision: an empty quiz, partial inserted-attempt set, over-100 score, or
  synthetic perfect score with no inserted question attempts cannot receive
  `quiz_perfect`.
- Decision: perfect XP is awarded only through the shared official quiz
  persistence path, so frontend-submitted score values cannot grant it.

Verification plan:

- Add backend tests proving non-perfect attempts do not award perfect XP, first
  perfect attempts award `quiz_correct` + `quiz_pass` + `quiz_perfect`, later
  perfect attempts do not duplicate any of those idempotent rewards, and the
  perfect predicate rejects empty/partial submissions. Status: implemented.
- Update Topic Workspace quiz tracking coverage for the additional
  `quiz_perfect` transaction. Status: implemented.
- Run focused quiz perfect, quiz history, mistake notebook, Topic Workspace
  quiz, XP service tests, and compile checks. Status: implemented.
- Run strong review before committing. Status: implemented.
- Strong review found the perfect predicate accepted over-100 scores and that
  the docs/test claim about partial submissions needed a real expected-count
  guard. The predicate now requires exact score `100` and inserted attempts to
  match the question snapshot count. Status: implemented.

### Slice 28: Retry-Correct Quiz XP

Status: implemented.

Reason for this slice:

- `quiz_retry_correct` existed in the XP reward table and daily cap mapping but
  was not wired.
- The XP economy should distinguish a question answered correctly the first
  time from a question corrected after a prior mistake.

Planned backend scope:

- Classify each newly correct quiz question attempt as either first-correct or
  retry-correct by checking prior attempts for that `(user, question)`. Status:
  implemented.
- Award `quiz_retry_correct` instead of `quiz_correct` when the student has a
  prior incorrect attempt and no prior correct attempt for that question.
  Status: implemented.
- Keep retry-correct rewards in the existing `quiz_correct` daily cap category.
  Status: implemented.
- Avoid UI changes in this slice. Status: implemented.

Decisions:

- Decision: retry-correct is a replacement for first-correct XP on that
  question, not an additional bonus layered on top of `quiz_correct`.
- Decision: once a question has any prior correct attempt for that student, no
  later correct attempt awards either `quiz_correct` or `quiz_retry_correct`.
- Decision: the classifier uses persisted `QuestionAttempt` history and
  excludes the current quiz attempt, keeping the decision backend-owned.

Verification plan:

- Update focused XP tests so wrong-then-perfect awards
  `quiz_retry_correct` + `quiz_pass` + `quiz_perfect`, not `quiz_correct`.
  Status: implemented.
- Keep Topic Workspace perfect-first-try coverage expecting full
  `quiz_correct` rewards when there is no prior mistake. Status: implemented.
- Run focused quiz perfect, quiz history, mistake notebook, Topic Workspace
  quiz, XP service tests, and compile checks. Status: implemented.
- Run strong review before committing. Status: implemented.
- Strong review found the retry classifier should not materialize all
  historical attempts for heavily retried questions. The classifier now uses a
  grouped aggregate query that returns at most one row per question. Status:
  implemented.

### Slice 29: Daily Login and Streak XP

Status: implemented.

Reason for this slice:

- `daily_login` and `streak_bonus` existed in the XP reward table and daily cap
  mapping but were not wired.
- `UserXP` already stores `last_active_date` and `streak_days`, so the simplest
  implementation is to award login/streak XP at successful auth session
  creation and let the existing XP total/streak machinery update the projection.

Planned backend scope:

- Add an idempotent `award_daily_login_xp` service. Status: implemented.
- Award `daily_login` once per user per UTC date. Status: implemented.
- Award `streak_bonus` when the prior active date was exactly yesterday.
  Status: implemented.
- Wire successful password login, Google login, and email verification session
  creation through the shared daily-login award helper. Status: implemented.
- Avoid UI changes in this slice. Status: implemented.

Decisions:

- Decision: daily login XP is backend-owned and attached to successful auth
  session creation, not a frontend-triggered claim.
- Decision: daily login and streak bonus use date-scoped XP idempotency keys so
  repeated same-day logins cannot farm XP.
- Decision: the streak bonus is awarded only for consecutive-day continuation,
  not the first login day and not after missed days.
- Decision: this slice uses UTC dates, matching the existing XP daily cap and
  daily quest date behavior.
- Decision: when the daily quest cap reduces login XP to zero, the service still
  touches `UserXP.last_active_date` and `streak_days` for the login day so
  capped XP policy does not break activity history.

Verification plan:

- Add service tests for same-day idempotency, next-day streak bonus, XP totals,
  and streak projection updates. Status: implemented.
- Add cap-exhaustion coverage proving a zero-XP login still advances activity
  history without duplicating transactions. Status: implemented.
- Add route-level password login coverage proving repeated same-day logins
  award daily login XP only once. Status: implemented.
- Add route-level Google login and email verification coverage for the shared
  session helper. Status: implemented.
- Run focused daily-login, XP service, auth tests, and compile checks. Status:
  implemented.
- Run strong review before committing. Status: implemented.

Review notes addressed:

- Moved auth token/cookie creation before the daily-login XP commit so a token
  or cookie failure cannot burn the date-scoped login idempotency key.
- Repaired the capped-login edge case where inserted zero-amount transactions
  could otherwise skip the `UserXP` activity projection update.

### Slice 30: Exam Problem Completion XP

Status: implemented.

Reason for this slice:

- `exam_complete` existed in the XP reward table and daily cap mapping but was
  not wired.
- Slice 21 intentionally deferred exam XP while adding exam problem progress
  storage. That storage now gives us a clear backend-owned completion event.

Planned backend scope:

- Award `exam_complete` when an entitled student marks an Exam Bank problem as
  completed. Status: implemented.
- Deduplicate the reward once per `(user, exam problem)` using an XP
  idempotency key. Status: implemented.
- Keep saved/opened progress mutations free of XP side effects. Status:
  implemented.
- Return `xp_awarded` from the progress mutation for future UI feedback.
  Status: implemented.
- Avoid broad UI changes in this slice. Status: implemented.

Decisions:

- Decision: exam completion XP is tied to the whole exam problem capsule, not
  each individual part. Part-level progress can be a later model if needed.
- Decision: the reward is backend-owned and only granted after the existing
  subject-access check succeeds.
- Decision: repeated completion requests and stale opened requests remain
  monotonic and cannot duplicate XP because the XP transaction key is scoped to
  `(user, problem)`.
- Decision: `exam_complete` remains in the existing `lab_exam` daily cap
  category.

Verification plan:

- Add route-level tests proving opened/saved progress awards no XP, first
  completion awards `exam_complete`, repeated completion awards zero, and
  stale opened requests do not downgrade completion. Status: implemented.
- Run focused exam-bank progress and XP service tests plus compile checks.
  Status: implemented.
- Run strong review before committing. Status: implemented.

Review notes addressed:

- Strong review found no blocking issues. It noted concurrent duplicate
  completion coverage as a residual gap; the slice relies on the shared XP
  idempotency constraint for that case.

### Slice 31: Mistake-Corrected XP

Status: implemented.

Reason for this slice:

- The quiz roadmap calls out medium XP for correcting previously missed
  questions.
- Mistake Notebook already has a backend-verified transition from `open` to
  `corrected` when a later official quiz attempt answers the question
  correctly.

Planned backend scope:

- Add a `mistake_corrected` XP reason. Status: implemented.
- Award it only when an open Mistake Notebook entry is corrected by an official
  quiz attempt. Status: implemented.
- Deduplicate the reward once per `(user, question)` using an XP idempotency
  key. Status: implemented.
- Keep the reward in the existing quiz-correct daily cap category. Status:
  implemented.
- Avoid manual frontend claim/review UI in this slice. Status: implemented.

Decisions:

- Decision: `mistake_corrected` is backend-verified. Students cannot claim it
  by manually marking a mistake reviewed.
- Decision: the v1 reward is 10 XP, larger than `quiz_retry_correct` but still
  capped with quiz-correct rewards.
- Decision: the reward is tied to the Mistake Notebook `open -> corrected`
  transition, not to every later correct answer for the same question.

Verification plan:

- Add/update tests proving a wrong-then-correct question awards
  `quiz_retry_correct` plus `mistake_corrected`, and later correct attempts
  award neither again. Status: implemented.
- Update perfect-quiz retry XP expectations for the additional correction
  bonus. Status: implemented.
- Run focused mistake notebook, quiz perfect, Topic Workspace quiz, XP service
  tests, and compile checks. Status: implemented.
- Run strong review before committing. Status: implemented.

Review notes addressed:

- Strong review found that `mistake_corrected` was skipped when the student had
  an earlier correct attempt before a later wrong attempt. The award assembly
  now keeps first/retry-correct XP eligibility separate from the notebook
  correction bonus, and regression coverage includes correct -> wrong ->
  correct.

### Slice 32: Exam Problem Part Progress

Status: implemented.

Reason for this slice:

- Exam Bank already supports part capsules with part-level enonce, written
  correction, and optional video correction.
- Product decisions say exam problem opened/correction viewed/video watched
  and self-grade state belong at the part level, because Bac corrections are
  often taught per part.
- Whole-problem completion XP is already implemented and should stay stable
  while part-level revision signals are added.

Planned backend scope:

- Add `user_exam_problem_part_progress` keyed by user and exam problem part.
  Status: implemented.
- Track opened state, correction reveal count, video watch count, current
  self-grade, self-grade history, retry-later, and timestamps. Status:
  implemented.
- Add part progress fields to Exam Bank list/detail part payloads. Status:
  implemented.
- Add `POST /api/exam-bank/parts/{part_id}/progress`. Status: implemented.
- Enforce subject access before part progress mutations. Status: implemented.
- Keep part progress free of XP side effects. Status: implemented.

Decisions:

- Decision: part-level self-grade is student-reported revision metadata, not
  official correctness and not a completion event.
- Decision: self-grade requires correction reveal, but no backend timer is
  enforced; the reading delay remains a frontend concern.
- Decision: video watch state is a simple count/timestamp in v1, not a
  provider-level watch-percent integration.
- Decision: retry-later is local to part progress for now. It can later feed
  bank filters without creating a unified revision queue.
- Decision: whole-problem completion remains the only Exam Bank XP event in
  this area for now.

Verification plan:

- Add model/migration declaration tests. Status: implemented.
- Add route tests for opened, correction reveal, video watched, self-grade,
  retry-later, detail/list projection, and zero XP. Status: implemented.
- Add locked mutation, pre-reveal self-grade, and invalid self-grade tests.
  Status: implemented.
- Run focused exam bank tests, migration-chain check if the accepted baseline
  allows it, compile checks, and strong review before committing. Status:
  implemented.

Review notes addressed:

- Strong review found no blocking correctness or access-control issues.
- Added a locked-mutation regression assertion that no part-progress row is
  created when the subject access gate rejects the write.
- Residual risk: correction/video counters and self-grade history are
  read-modify-write fields, so concurrent duplicate requests can lose a counter
  increment or one history entry. They are v1 revision signals, not money, XP,
  or authoritative correctness, so this remains acceptable for this slice.

### Slice 33: Exam Part Revision Filters

Status: implemented.

Reason for this slice:

- Slice 32 stores part-level self-grade, correction reveal, and retry-later
  state, but the Exam Bank list still needs bank-local revision filters.
- Product direction keeps revision behavior inside each bank for v1 instead of
  building a unified revision queue.

Planned backend scope:

- Add Exam Bank list filters for `part_self_grade`, `part_retry_later`, and
  `part_correction_revealed`. Status: implemented.
- Match exam problem capsules when at least one published part satisfies the
  requested part revision filter. Status: implemented.
- Keep response shape stable by returning the matching problem capsule with its
  published parts, rather than introducing a new part-only list contract.
  Status: implemented.

Decisions:

- Decision: filters operate at the problem-capsule level because the current
  Exam Bank API is exam -> problem -> parts. A dedicated part-only revision
  queue remains out of v1 scope.
- Decision: `not_started`, `retry_later=false`, and
  `part_correction_revealed=false` include parts with no progress row.
- Decision: these filters do not alter XP, saved state, or whole-problem
  progress semantics.

Verification plan:

- Add route tests for current self-grade, retry-later, correction-unrevealed,
  no-progress matching, and invalid filter validation. Status: implemented.
- Run focused exam bank tests, migration tests, compile checks, and strong
  review before committing. Status: implemented.

Review notes addressed:

- Strong review found no blocking correctness or security issues.
- Added cross-user isolation coverage and `part_retry_later=false` coverage
  after review, so another student's part progress cannot affect the current
  student's revision filters.

### Slice 34: Exercise Bank Comments

Status: implemented.

Reason for this slice:

- The Exercise Workspace plan requires comments behind a dedicated
  Comments section/tab.
- Existing comments were TopicItem-only, which would incorrectly bind Exercise
  Bank discussion to the lesson workspace model.

Planned backend scope:

- Allow comments to target an Exercise Bank exercise as well as a TopicItem.
  Status: implemented.
- Add `GET /api/interactions/exercise-comments` and
  `POST /api/interactions/exercise-comments`. Status: implemented.
- Reuse the existing comment author/reply response shape. Status: implemented.
- Enforce Exercise Bank subject access before listing or creating exercise
  comments. Status: implemented.

Decisions:

- Decision: keep dedicated exercise-comment routes instead of overloading
  `/api/interactions/comments`, so existing TopicItem comment behavior remains
  stable.
- Decision: reuse the `comments` table with a nullable `exercise_id` rather
  than introducing a second comment table. Add a database invariant so each
  comment targets exactly one surface.
- Decision: comments are product discussion state and do not award XP.

Verification plan:

- Add model/migration declaration tests. Status: implemented.
- Add route tests for parent/reply counts, parent mismatch, free-preview access,
  and locked exercise list/create rejection. Status: implemented.
- Run focused Exercise Bank/comment tests, migration tests, compile checks, and
  strong review before committing. Status: implemented.

### Slice 35: Minimal Finance Backoffice

Status: implemented.

Reason for this slice:

- Payment rails for CMI, virement, CashPlus, and AshPlus exist, but finance
  staff still need a launch-facing review surface outside emergency SQLAdmin.
- The product TODO calls out finance review UI, reconciliation import UI,
  mismatch handling, and auditability as remaining launch payment work.

Planned frontend scope:

- Add a staff-only `/admin/finance` page under the existing admin auth boundary.
  Status: implemented.
- List manual payment transactions by status using the provider-neutral
  `/api/payments/manual-payment-requests` endpoint. Status: implemented.
- Allow staff to approve or reject pending manual payment requests with a
  reason. Status: implemented.
- Add compact single-row reconciliation and normalized JSON import controls for
  virement, CashPlus, and AshPlus. Status: implemented.
- Link the finance page from the existing admin dashboard. Status: implemented.

Decisions:

- Decision: keep this slice in `/admin/finance` rather than creating the full
  `/backoffice/*` zone now. The current app already has a staff-protected admin
  shell; the broader role/permission split remains a later backoffice slice.
- Decision: use the existing provider-neutral payment endpoints only. Do not add
  new Stripe UI or route new payment work through Stripe.
- Decision: show `user_id` rather than user email/name because the current
  manual payment response does not expose user profile data. A richer finance
  queue can add a backend projection later.
- Decision: JSON import accepts normalized rows only. Bank/CashPlus/AshPlus file
  parsing remains outside v1 until provider export formats are contracted.

Verification plan:

- Add typed frontend client tests for list, approve, reject, reconciliation, and
  import payloads. Status: implemented.
- Add jsdom page tests for queue rendering, approval action, single
  reconciliation, and import summary. Status: implemented.
- Run targeted finance page/client tests plus frontend typecheck/lint before
  committing. Status: implemented.

Verification completed:

- `python -m pytest tests_fastapi/test_payments.py -k "manual_payment or reconciliation" -q`
  passed: 16 passed, 65 deselected.
- `npm test -- tests/adminFinance.test.ts tests/adminFinancePage.test.tsx`
  passed: 8 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run audit:csp-styles` passed with zero inline style debt.
- Playwright smoke opened `/admin/finance` behind the staff guard with mocked
  profile and payment APIs, verified a manual payment row, and refreshed
  `frontend/artifacts/admin-finance-smoke.png`.

Review notes addressed:

- Fixed filtered queue mutation behavior so approved, rejected, or reconciled
  transactions only remain visible when their returned status matches the
  active status filter.
- Fixed finance review reasons to be stored per transaction id instead of one
  shared input value across all pending payment cards.

### Slice 36: Finance Audit Visibility

Status: implemented.

Reason for this slice:

- Slice 35 gave finance staff mutation controls for approve, reject, reconcile,
  and import, but the source-of-truth records were still hidden behind database
  access.
- The launch finance checklist requires ledger reconciliation, provider-event
  inspection, reconciliation import history, and accountant export evidence.

Planned backend scope:

- Add staff-only read endpoints for recent finance ledger entries. Status:
  implemented.
- Add staff-only read endpoints for recent payment provider events. Status:
  implemented.
- Add staff-only read endpoints for reconciliation import summaries. Status:
  implemented.
- Support transaction-scoped ledger/provider-event filters for finance drill-in.
  Status: implemented.

Planned frontend scope:

- Add typed finance audit clients for ledger, provider events, and import
  summaries. Status: implemented.
- Add compact audit panels to `/admin/finance`. Status: implemented.
- Add transaction-scoped audit loading from a payment card. Status:
  implemented.
- Add client-side CSV export for the loaded ledger, provider event, and import
  summary rows. Status: implemented.

Decisions:

- Decision: keep Slice 36 read-only. Refunds, manual grants, and ledger
  reversals remain later money-mutation slices that need more RBAC and approval
  modeling.
- Decision: CSV export is client-side for the currently loaded bounded rows.
  Server-side accountant exports and export audit records remain a later
  backoffice/accounting slice.
- Decision: keep the endpoints under `/api/payments` for now because the
  existing finance mutations already live there. A future `/backoffice/finance`
  route split can re-export the same service layer.

Verification plan:

- Add backend route tests for staff-only access, transaction-scoped ledger/event
  reads, and reconciliation import history. Status: implemented.
- Add frontend client tests for audit paths, endpoint calls, and CSV escaping.
  Status: implemented.
- Add finance page tests for audit rendering, transaction-scoped audit loading,
  and CSV export controls. Status: implemented.
- Run focused payment tests, finance frontend tests, typecheck/lint, CSP audit,
  browser smoke, and strong review before committing. Status: implemented.

Verification completed:

- `python -m pytest tests_fastapi/test_payments.py -q` passed: 84 tests.
- `npm test -- tests/adminFinance.test.ts tests/adminFinancePage.test.tsx`
  passed: 12 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run audit:csp-styles` passed with zero inline style debt.
- Playwright smoke opened `/admin/finance` behind the staff guard with mocked
  profile, payment queue, ledger, provider-event, and import-history APIs,
  verified transaction-scoped audit drill-in, confirmed global imports are not
  shown in a scoped view, and refreshed
  `frontend/artifacts/admin-finance-audit-smoke.png`.

Review notes addressed:

- Added an audit request sequence guard so slower all-audit responses cannot
  overwrite a newer transaction-scoped audit view.
- Hid global reconciliation import history while viewing a transaction-scoped
  audit trail because imports do not yet have a transaction filter.
- Hardened client-side CSV export against spreadsheet formula injection.

### Slice 37: Visible Payment Support State

Status: implemented.

Reason for this slice:

- The payment gateway plan requires failed/provider-outage payment states to be
  visible to students, not only logged or shown as a transient toast.
- The launch pricing UI already uses provider-neutral payment requests, so the
  smallest next step is to make payment creation failures persistent and
  actionable without introducing a full support center.

Planned frontend scope:

- Add a persistent support/escalation panel on `/pricing` when payment request
  creation fails. Status: implemented.
- Include the selected payment method and provider/backend error detail in the
  panel. Status: implemented.
- Add retry and support contact actions. Status: implemented.
- Clear stale pending-payment/support panels when starting a new payment attempt
  or switching payment method. Status: implemented.

Decisions:

- Decision: keep this slice frontend-only. A real support ticket model remains
  a later support-center/backoffice slice.
- Decision: keep Stripe compatibility helpers untouched, but do not route the
  visible pricing failure state through Stripe checkout.
- Decision: use a `mailto:support@kresco.ma` CTA for v1 because it gives
  students an immediate escalation path without adding an unmodeled backend
  support workflow.

Verification plan:

- Add pricing-page tests for persistent payment support state, retry clearing
  the failure after a pending success, and method-switch clearing stale support.
  Status: implemented.
- Run focused payment/pricing tests, TypeScript, lint, browser smoke, and strong
  review before committing. Status: implemented.

Verification completed:

- `npm test -- tests/pricingPagePayments.test.tsx tests/payments.test.ts tests/manualPayments.test.ts tests/cmiReturnPages.test.tsx`
  passed: 28 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run audit:csp-styles` passed with zero inline style debt.
- Playwright smoke opened `/pricing` behind the auth guard with mocked profile
  and payment APIs, verified the visible support panel for invalid CMI provider
  metadata, and refreshed
  `frontend/artifacts/pricing-payment-support-smoke.png`.

Review notes addressed:

- Added a payment request sequence guard so a stale in-flight result cannot
  redirect, show pending state, or restore a support panel after the student
  switches payment method.
- Added a deferred-promise regression test for switching methods while the
  previous payment request is still in flight.
- Fixed support-panel contrast after browser smoke showed pale text on the
  actual pricing surface.

### Slice 38: Student Payment State Recovery

Status: implemented.

Reason for this slice:

- The pricing page showed pending/support states only inside the current browser
  session. Reloading the page lost a pending manual payment or a failed provider
  state even though the backend had the transaction.
- The payment roadmap requires visible pending/failed states before broader
  testing, without granting access until finance/provider confirmation.

Implemented scope:

- Added a student-authenticated current payment endpoint for the signed-in
  user's latest Pro payment rail state. Status: implemented.
- Restored pending manual payment instructions and proof upload after a pricing
  page reload. Status: implemented.
- Restored failed, expired, mismatched, and provider-pending states as a
  persistent support panel. Status: implemented.
- Expired stale pending requests during recovery so open payment keys do not
  remain active forever. Status: implemented.

Decisions:

- Decision: return the existing `PaymentRequestOut` shape for student recovery,
  but only for the authenticated owner.
- Decision: keep closed states visible to students because the launch payment
  UX needs actionable failed/expired feedback.
- Decision: strip `instructions` from closed recovered states so failed or
  expired CMI attempts cannot expose stale signed form-post fields.
- Decision: do not auto-submit or redirect recovered CMI requests from page
  load. The page surfaces the provider-pending state and lets the student retry
  intentionally.

Verification plan:

- Add backend tests for pending recovery, cross-user isolation, paid suppression,
  failed-state visibility, and closed CMI instruction stripping. Status:
  implemented.
- Add frontend client tests for the current payment endpoint. Status:
  implemented.
- Add pricing page tests for recovered pending manual requests and recovered
  failed support state. Status: implemented.
- Run focused payment/pricing tests, TypeScript, lint, CSP audit, browser smoke,
  and strong review before committing. Status: implemented.

Verification completed:

- `python -m pytest tests_fastapi/test_payments.py -q` passed: 88 tests.
- `npm test -- tests/pricingPagePayments.test.tsx tests/payments.test.ts tests/manualPayments.test.ts tests/cmiReturnPages.test.tsx`
  passed: 34 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run audit:csp-styles` passed with zero inline style debt.
- Playwright smoke opened `/pricing` with mocked profile and current payment
  APIs, verified the recovered failed-payment support panel, and refreshed
  `frontend/artifacts/pricing-current-payment-recovery-smoke.png`.

Review notes addressed:

- Closed recovered payment states now strip `instructions` so failed/expired
  CMI attempts cannot expose stale signed form-post fields.
- Recovery state is keyed by user identity and cleared on empty recovery
  responses so payment references cannot leak across non-Pro account switches.

## Open Risks

- Existing payment code and tests are Stripe-oriented. The first gateway slice
  must avoid a half-migration where both old and new flows grant access
  inconsistently.
- Refunds, manual grants, and full finance RBAC remain intentionally deferred
  money-mutation work.
