# Backend Fix Verification

## Summary

- `git status --short` was run first. Backend source/test files in this scope are modified, so the one finding below is marked `[WIP-PROVISIONAL]`.
- Read `docs/audits/_state.md`, `docs/audits/00-MASTER-REPORT.md`, `docs/audits/W2-04-critical-test-design.md`, and `docs/audits/W2-10-backend-security-followup.md`.
- Exam progress limits are present and match the requested pattern: `backend/app/routers/exam_bank.py:3` imports `Request`, `backend/app/routers/exam_bank.py:8` imports `limiter`, `backend/app/routers/exam_bank.py:68`/`81` define the two progress POST routes, `backend/app/routers/exam_bank.py:69`/`82` apply `@limiter.limit("30/minute")`, and `backend/app/routers/exam_bank.py:71`/`84` include the SlowAPI `request: Request` parameter.
- Exercise concept search is bounded and LIKE-escaped: `backend/app/routers/exercises.py:34` uses `concept: str | None = Query(default=None, max_length=80)`, `backend/app/services/exercise_bank.py:21` imports `LIKE_ESCAPE`, `normalize_substring_search`, and `substring_search_pattern`, `backend/app/services/exercise_bank.py:307` normalizes the concept filter, and `backend/app/services/exercise_bank.py:329` uses `.ilike(substring_search_pattern(concept), escape=LIKE_ESCAPE)`. The shared helper escapes `\`, `%`, and `_` at `backend/app/services/search.py:16`-`22`.
- The six W2-04 regression tests exist and align with the intended behavior:
  - `backend/tests_fastapi/test_payments.py:1527` verifies CMI sensitive-field redaction in provider events.
  - `backend/tests_fastapi/test_payments.py:1722` verifies wrong CMI client/currency callbacks fail without access.
  - `backend/tests_fastapi/test_auth.py:574` verifies Firebase verification revokes a stale token.
  - `backend/tests_fastapi/test_admin_overview.py:1156` verifies unverified staff with a permission row cannot enter staff routes.
  - `backend/tests_fastapi/test_firestore_realtime.py:68` verifies Firestore retry, fail-closed, and missing-config behavior.
  - `backend/tests_fastapi/test_realtime.py:156` verifies revoked entitlement removes the offering realtime channel.
- Bearer logout/token_type check: no obvious runtime regression found. `backend/app/routers/users.py:242` accepts optional bearer credentials, `backend/app/routers/users.py:246` selects bearer or cookie token, `backend/app/services/auth_sessions.py:15`-`42` revokes the token version when valid, and `backend/app/schemas/users.py:42` declares `token_type: Literal["bearer"] = "bearer"`.
- Validation: an initial root-level exact-nodeid run failed before collection with `ModuleNotFoundError: No module named 'app'`. Rerunning the same exact nodeids from `backend/` collected 8 items and passed: `tests_fastapi/test_payments.py::test_cmi_callback_redacts_sensitive_fields_in_provider_event`, `tests_fastapi/test_payments.py::test_cmi_callback_wrong_client_or_currency_marks_mismatch_without_access`, `tests_fastapi/test_auth.py::test_mobile_session_returns_bearer_token_without_cookies`, `tests_fastapi/test_auth.py::test_firebase_login_verifying_existing_user_revokes_old_token`, `tests_fastapi/test_auth.py::test_logout_revokes_existing_bearer_token_without_cookie`, `tests_fastapi/test_admin_overview.py::test_unverified_staff_with_permission_cannot_access_staff_routes`, `tests_fastapi/test_firestore_realtime.py::test_publish_firestore_message_retries_sync_writer_and_fails_closed`, and `tests_fastapi/test_realtime.py::test_realtime_subscriptions_remove_offering_channel_after_entitlement_revoked`.

## Findings - severity, exact file:line, quoted evidence, concrete fix

### LOW [WIP-PROVISIONAL] - Mobile session test does not assert the new `token_type` response contract

Exact location: `backend/tests_fastapi/test_auth.py:213`

Quoted evidence:
- `backend/tests_fastapi/test_auth.py:213`: `assert response.status_code == 200`
- `backend/tests_fastapi/test_auth.py:216`: `assert body["access_token"]`
- `backend/tests_fastapi/test_auth.py:217`: `assert "csrf_token" not in body`
- `backend/app/schemas/users.py:42`: `token_type: Literal["bearer"] = "bearer"`

Impact:
The schema currently supplies the field, but the targeted mobile-session regression test would still pass if response serialization later omitted or renamed `token_type`.

Concrete fix:
Add `assert body["token_type"] == "bearer"` to `test_mobile_session_returns_bearer_token_without_cookies` immediately after the access-token assertion.

## Leads - remaining questions or `None`

None.
