# Recursive Codebase Audit Master Report

## Status
Waves 1, 2, and the verification wave are complete. The audit has not reached
fixpoint: the verification wave confirmed remaining HIGH/MEDIUM findings,
external-state leads remain, and product/security decisions are still open.

Current pre-existing WIP before audit artifacts:
- `frontend/app/page.tsx`
- `frontend/components/landing/`

Audit artifacts added under `docs/audits/` are expected working-tree changes.
The Wave 1 DevOps patch at `docs/audits/patches/09-devops-workflows.patch` is
obsolete and must not be applied as-is.

## Executive Summary
- Firestore realtime authorization remains the top unresolved risk. The repo
  still lacks checked-in Firestore rules, a rules-readable membership
  projection, and a safe live-session channel split.
- Mobile bearer auth is improved: `/api/auth/mobile-session` returns bearer
  metadata and bearer logout now revokes tokens. Remaining decisions are whether
  mobile permanently uses `/auth/mobile-session` and how mixed bearer plus stale
  cookie CSRF should behave.
- API generated-client readiness is improved: public mutation responses are
  typed and `/api/internal/*` is hidden from public OpenAPI. Error envelopes,
  OpenAPI export ownership, and resource-open compatibility remain.
- Obvious backend trust-boundary tests were added and pass. Larger backend
  risks remain around anonymous analytics, destructive downgrade behavior,
  entitlement invariants, staff-payment query/indexing, and DB pool budgets.
- Frontend quick wins were applied: Sonner no longer eagerly loads, the resource
  preview sandbox is tightened, and dead admin rollback code was removed.

## Completed Fixes
- Backend:
  - Added explicit 30/minute limits to exam-bank progress mutations.
  - Escaped exercise concept LIKE filters and bounded the query length.
  - Added bearer-token logout revocation.
  - Added `token_type: "bearer"` to mobile session responses.
  - Added typed public mutation response models and reusable `OkOut`.
  - Hid `/api/internal/*` from public OpenAPI.
- Tests:
  - Added CMI merchant/currency binding and redaction tests.
  - Added Firebase stale-token revocation and bearer logout tests.
  - Added unverified permissioned staff actor boundary test.
  - Added Firestore realtime async retry/config test.
  - Added revoked entitlement realtime channel removal test.
  - Added OpenAPI schema assertions for public mutations, internal-route hiding,
    and `MobileSessionOut.token_type`.
- Frontend:
  - Made `AppToaster` load Sonner only after a toast request.
  - Updated AppToaster tests for the event-only contract.
  - Tightened topic resource preview iframe sandbox to no granted capabilities.
  - Removed the dead admin users rollback workspace while preserving active
    helpers.
- DevOps:
  - Added PR-only CI cancel-in-progress concurrency.
  - Added Buildx registry layer caching for backend and frontend Docker builds.
  - Made backend Cloud SQL migration cleanup launch-mode aware.
  - Added production-launch backend `min-instances=1`.
  - Made staging smoke stop Cloud SQL by default with explicit manual
    keep-running opt-in.
  - Added scheduled nightly staging Cloud SQL stop workflow in the shared
    `staging-cloud-sql-${{ github.repository }}` concurrency group.

## Remaining Priority Backlog
1. HIGH - Add Firestore rules, deploy config, emulator tests, and
   rules-readable realtime membership docs.
2. HIGH - Split live-session realtime into public, moderation, and per-student
   channels before granting student Firestore reads.
3. HIGH - Make analytics writes trustworthy for founder/admin metrics.
4. HIGH - Replace destructive downgrade in
   `backend/alembic/versions/0086_founder_operations_rewrite.py`.
5. MEDIUM - Enforce active subject entitlement uniqueness/overlap at the DB
   layer and serialize grant paths.
6. MEDIUM - Fix staff-payment profile list N+1 aggregate pattern and add the
   matching order index.
7. MEDIUM - Extend query-plan audit for new admin/staff query patterns.
8. MEDIUM - Add a DB pool-budget deploy guard tied to per-environment budgets.
9. MEDIUM - Resolve resource-open fallback contract and broader error envelope
   shape for generated clients.
10. MEDIUM - Decide mixed bearer-plus-cookie CSRF behavior and whether mobile
    permanently uses `/api/auth/mobile-session`.
11. MEDIUM - Lazy/click-gate exam correction iframes. This was not implemented
    in the fix pass.
12. MEDIUM - Continue larger frontend work: root auth island split, CSP audit
    hardening, Tailwind override migration, and Zed/PDF decomposition.

## Validation
- Backend exact regression set:
  - Command: `python -m pytest tests_fastapi/test_payments.py::test_cmi_callback_redacts_sensitive_fields_in_provider_event tests_fastapi/test_payments.py::test_cmi_callback_wrong_client_or_currency_marks_mismatch_without_access tests_fastapi/test_auth.py::test_mobile_session_returns_bearer_token_without_cookies tests_fastapi/test_auth.py::test_firebase_login_verifying_existing_user_revokes_old_token tests_fastapi/test_auth.py::test_logout_revokes_existing_bearer_token_without_cookie tests_fastapi/test_admin_overview.py::test_unverified_staff_with_permission_cannot_access_staff_routes tests_fastapi/test_firestore_realtime.py::test_publish_firestore_message_retries_sync_writer_and_fails_closed tests_fastapi/test_realtime.py::test_realtime_subscriptions_remove_offering_channel_after_entitlement_revoked tests_fastapi/test_api_docs_routing.py::test_public_mutations_have_typed_success_schemas_and_internal_routes_are_hidden -q`
  - Result: passed, 9 tests.
- Frontend AppToaster test:
  - Command: `npx vitest run tests/appToaster.test.tsx`
  - Result: passed, 3 tests.
- Frontend typecheck:
  - Command: `npm run typecheck`
  - Result: passed.
- Frontend lint:
  - Command: `npm run lint`
  - Result: passed.
- Diff whitespace:
  - Command: `git diff --check`
  - Result: passed; Git printed line-ending warnings only.
- Broader backend focused run:
  - Result: 153 passed, 1 pre-existing order-sensitive failure in
    `test_admin_users_access_requires_staff_and_returns_user_rows`, where the
    seeded row can fall outside `limit=25` after earlier test files populate
    many users. This was left unchanged as unrelated to the current fixes.

## Reports
Wave 1:
- `01-backend-security.md`
- `02-frontend-security-firestore.md`
- `03-data-layer.md`
- `04-api-contract.md`
- `05-frontend-maintainability.md`
- `06-test-gaps.md`
- `07-frontend-performance.md`
- `08-backend-gcp-cost.md`
- `09-devops-implementation.md`
- `10-mobile-readiness.md`

Wave 2:
- `W2-01-firestore-realtime-auth.md`
- `W2-02-mobile-auth-csrf-openapi.md`
- `W2-03-devops-patch-validation.md`
- `W2-04-critical-test-design.md`
- `W2-05-api-contract-codegen.md`
- `W2-06-data-layer-deepening.md`
- `W2-07-frontend-security-hardening.md`
- `W2-08-frontend-performance-deepening.md`
- `W2-09-frontend-maintainability-deepening.md`
- `W2-10-backend-security-followup.md`

Verification wave:
- `V3-01-backend-fix-verifier.md`
- `V3-02-api-mobile-contract-verifier.md`
- `V3-03-frontend-fix-verifier.md`
- `V3-04-devops-workflow-verifier.md`
- `V3-05-remaining-high-verifier.md`
- `V3-06-audit-artifact-verifier.md`

## Fixpoint Checklist
- Latest verification produced zero MEDIUM+ findings: no.
- Lead queue empty: no.
- Final verification wave run: yes.
- Master contains only verified findings: yes, with remaining unresolved items
  explicitly listed above.
