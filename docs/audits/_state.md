# Recursive Audit State

## Current Status
- Completed waves: 1, 2, and verification wave 3.
- Fixpoint reached: no.
- Final verification wave run: yes.
- Remaining work: unresolved HIGH/MEDIUM findings and external/product leads
  listed below.
- Pre-existing WIP before audit work:
  - `frontend/app/page.tsx`
  - `frontend/components/landing/`
- Wave 1 DevOps patch artifact:
  - `docs/audits/patches/09-devops-workflows.patch`
  - Status: obsolete; do not apply as-is.

## Audit Reports
Wave 1:
- `docs/audits/01-backend-security.md`
- `docs/audits/02-frontend-security-firestore.md`
- `docs/audits/03-data-layer.md`
- `docs/audits/04-api-contract.md`
- `docs/audits/05-frontend-maintainability.md`
- `docs/audits/06-test-gaps.md`
- `docs/audits/07-frontend-performance.md`
- `docs/audits/08-backend-gcp-cost.md`
- `docs/audits/09-devops-implementation.md`
- `docs/audits/10-mobile-readiness.md`

Wave 2:
- `docs/audits/W2-01-firestore-realtime-auth.md`
- `docs/audits/W2-02-mobile-auth-csrf-openapi.md`
- `docs/audits/W2-03-devops-patch-validation.md`
- `docs/audits/W2-04-critical-test-design.md`
- `docs/audits/W2-05-api-contract-codegen.md`
- `docs/audits/W2-06-data-layer-deepening.md`
- `docs/audits/W2-07-frontend-security-hardening.md`
- `docs/audits/W2-08-frontend-performance-deepening.md`
- `docs/audits/W2-09-frontend-maintainability-deepening.md`
- `docs/audits/W2-10-backend-security-followup.md`

Verification wave:
- `docs/audits/V3-01-backend-fix-verifier.md`
- `docs/audits/V3-02-api-mobile-contract-verifier.md`
- `docs/audits/V3-03-frontend-fix-verifier.md`
- `docs/audits/V3-04-devops-workflow-verifier.md`
- `docs/audits/V3-05-remaining-high-verifier.md`
- `docs/audits/V3-06-audit-artifact-verifier.md`

## Fix Pass Completed
Backend source:
- `backend/app/routers/exam_bank.py` - exam progress rate limits.
- `backend/app/routers/exercises.py` - concept query bound.
- `backend/app/services/exercise_bank.py` - escaped concept search.
- `backend/app/routers/users.py` - bearer logout support.
- `backend/app/services/auth_sessions.py` - generalized session-token revoker.
- `backend/app/schemas/users.py` - mobile `token_type`.
- `backend/app/routers/courses.py` and `backend/app/schemas/courses.py` -
  topic completion response model.
- `backend/app/routers/gamification.py` and
  `backend/app/schemas/gamification.py` - daily quest claim response model.
- `backend/app/routers/notifications.py`,
  `backend/app/routers/professor.py`, and `backend/app/schemas/common.py` -
  ok-only mutation response models.
- `backend/app/routers/internal.py` - hidden from public OpenAPI.

Backend tests:
- `backend/tests_fastapi/test_payments.py`
- `backend/tests_fastapi/test_auth.py`
- `backend/tests_fastapi/test_admin_overview.py`
- `backend/tests_fastapi/test_firestore_realtime.py`
- `backend/tests_fastapi/test_realtime.py`
- `backend/tests_fastapi/test_api_docs_routing.py`

Frontend:
- `frontend/components/AppToaster.tsx`
- `frontend/tests/appToaster.test.tsx`
- `frontend/components/topic-workspace/TopicWorkspaceResourcePanel.tsx`
- `frontend/app/admin/users/page.tsx`

Workflows:
- `.github/workflows/ci-backend.yml`
- `.github/workflows/ci-frontend.yml`
- `.github/workflows/deploy-backend.yml`
- `.github/workflows/deploy-frontend.yml`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/stop-staging-cloud-sql-nightly.yml`

## Validation
- Backend exact regression command:
  `python -m pytest tests_fastapi/test_payments.py::test_cmi_callback_redacts_sensitive_fields_in_provider_event tests_fastapi/test_payments.py::test_cmi_callback_wrong_client_or_currency_marks_mismatch_without_access tests_fastapi/test_auth.py::test_mobile_session_returns_bearer_token_without_cookies tests_fastapi/test_auth.py::test_firebase_login_verifying_existing_user_revokes_old_token tests_fastapi/test_auth.py::test_logout_revokes_existing_bearer_token_without_cookie tests_fastapi/test_admin_overview.py::test_unverified_staff_with_permission_cannot_access_staff_routes tests_fastapi/test_firestore_realtime.py::test_publish_firestore_message_retries_sync_writer_and_fails_closed tests_fastapi/test_realtime.py::test_realtime_subscriptions_remove_offering_channel_after_entitlement_revoked tests_fastapi/test_api_docs_routing.py::test_public_mutations_have_typed_success_schemas_and_internal_routes_are_hidden -q`
  - Result: passed, 9 tests.
- Frontend AppToaster:
  - `npx vitest run tests/appToaster.test.tsx`
  - Result: passed, 3 tests.
- Frontend:
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
- Whitespace:
  - `git diff --check`: passed with line-ending warnings only.
- Broader backend focused run:
  - 153 passed, 1 pre-existing order-sensitive failure in
    `test_admin_users_access_requires_staff_and_returns_user_rows`.

## Remaining Leads
1. Firestore/realtime:
   - Add checked-in Firestore rules and deploy config.
   - Add server-maintained membership docs for Firestore rules.
   - Split live-session realtime channels into public, moderation, and
     per-student visibility.
   - External-state: verify deployed Firestore rules/database IDs for staging
     and production.
   - Product/architecture: decide whether native mobile reads Firestore
     directly or uses backend polling.

2. Backend security/data:
   - Make analytics event writes trustworthy for founder/admin metrics.
   - Replace destructive Alembic downgrade in revision `0086`.
   - Add DB-enforced active entitlement overlap invariant and serialize grant
     paths.
   - Fix staff-payment profile list N+1/index issue.
   - Extend query-plan audit for staff/admin query patterns.
   - Add DB pool-budget deploy guard and define per-environment budgets.
   - External-state: verify live `kresco-runtime` DB pool settings.
   - External-state: verify CMI sorted callback hash fallback requirement with
     the official current CMI integration kit/support.

3. Mobile/API:
   - Decide permanent mobile bootstrap endpoint:
     `/api/auth/mobile-session` versus dual-mode `/api/auth/firebase-session`.
   - Decide mixed bearer plus stale `__session` CSRF behavior.
   - Add OpenAPI export ownership for mobile codegen.
   - Resolve resource-open fallback contract.
   - Define a stable generated-client error envelope.

4. Frontend:
   - Lazy/click-gate exam correction iframes.
   - Defer `apiDataCache` sessionStorage hydration.
   - Split landing/auth bundle after the current landing WIP stabilizes.
   - Harden KaTeX/CSP audit boundary.
   - Migrate global Tailwind light-mode overrides.
   - Decompose Zed/PDF large components and storage side effects.

## Fixpoint Checklist
- Latest verification produced zero MEDIUM+ findings: no.
- Lead queue empty: no.
- Verification wave run: yes.
- Master report contains only verified findings: yes.
