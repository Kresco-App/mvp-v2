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
- Decision: model virement and CashPlus as pending/manual-confirmation rails,
  not instant checkout.
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

Status: in progress.

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

## Next Candidate Slices

These may change after subagent reconnaissance.

1. Exercise Bank data model and API skeleton.
2. Exercise reveal/self-grade state and XP guardrails.
3. Exam Bank part capsule model/API skeleton.
4. Quiz snapshot/version integrity.
5. XP economy caps and auditability.

## Open Risks

- The worktree contains a large accepted baseline. New commits must keep the
  scope clear so rollback is possible.
- Existing payment code and tests are Stripe-oriented. The first gateway slice
  must avoid a half-migration where both old and new flows grant access
  inconsistently.
- Manual payment rails require finance backoffice workflows; creating request
  rows without the review path is useful only if the state machine makes that
  limitation explicit.
