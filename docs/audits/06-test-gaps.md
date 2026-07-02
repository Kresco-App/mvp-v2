# Test Gaps

## Summary
- Critical backend areas have meaningful coverage, especially CMI happy path/replay/invalid hash, manual payments, permission grant/revoke, staff codes, VdoCipher OTP binding, and realtime outbox state transitions.
- The remaining highest-risk gaps are narrow assertions at trust boundaries, not whole missing suites.
- No findings touch the modified/untracked frontend WIP files, so no finding is marked `[WIP-PROVISIONAL]`.
- Ranked gaps below focus on blast radius: payment unlock, session revocation, staff authorization, payment data leakage, and Firestore delivery.

## Findings

### 1. CRITICAL - CMI callback merchant/currency binding lacks a regression test

`backend/app/services/payment_gateway.py:1977`

Evidence:

> `client_id = _payload_value(payload, "clientid")`

`backend/app/services/payment_gateway.py:1978`

Evidence:

> `if client_id != settings.cmi_client_id.strip():`

`backend/app/services/payment_gateway.py:1983`

Evidence:

> `currency = _payload_value(payload, "currency")`

`backend/app/services/payment_gateway.py:1984`

Evidence:

> `if currency not in {CMI_CURRENCY_CODE_MAD, "MAD"}:`

Existing adjacent coverage only exercises amount mismatch:

`backend/tests_fastapi/test_payments.py:1636`

Evidence:

> `def test_cmi_callback_amount_mismatch_marks_mismatch_without_access(`

Concrete test to add: in `backend/tests_fastapi/test_payments.py`, add `test_cmi_callback_wrong_client_or_currency_marks_mismatch_without_access`. Create a CMI payment request, build a signed callback with `clientid="other-client"` and recomputed `HASH`, assert response text is `FAILURE`, user remains non-pro, transaction becomes `PAYMENT_STATUS_MISMATCH`, no subject entitlements are created, and a second case with `currency="840"` has the same result.

### 2. HIGH - Firebase merge revokes old tokens but no test proves stale sessions are rejected

`backend/app/services/auth_firebase.py:139`

Evidence:

> `if not user.is_email_verified:`

`backend/app/services/auth_firebase.py:141`

Evidence:

> `user.auth_token_version = (user.auth_token_version or 0) + 1`

`backend/app/dependencies.py:52`

Evidence:

> `if (user.auth_token_version or 0) != token_payload.token_version:`

`backend/app/dependencies.py:53`

Evidence:

> `raise HTTPException(status_code=401, detail="Token revoked")`

Existing Firebase linking coverage verifies the profile mutation, not stale-token rejection:

`backend/tests_fastapi/test_auth.py:548`

Evidence:

> `def test_firebase_login_normalizes_email_and_links_existing_user(app_client, monkeypatch, run_db):`

Concrete test to add: in `backend/tests_fastapi/test_auth.py`, add `test_firebase_login_verifying_existing_user_revokes_old_token`. Seed an unverified existing user, mint an old token at version 0, complete `/api/auth/firebase-session`, then assert the old bearer token gets `401 Token revoked` on `/api/profile/me` while the newly issued cookie session can read the profile.

### 3. HIGH - Staff permission actor boundary has no endpoint test for unverified staff with a valid permission row

`backend/app/dependencies.py:83`

Evidence:

> `if not user.is_staff or not user.is_email_verified:`

`backend/app/dependencies.py:84`

Evidence:

> `raise HTTPException(status_code=403, detail="Staff access required")`

`backend/app/dependencies.py:111`

Evidence:

> `def require_staff_permission(permission: str) -> Callable[..., Awaitable[User]]:`

Existing admin permission tests cover invalid targets, not an unverified actor presenting a permissioned token:

`backend/tests_fastapi/test_admin_overview.py:1266`

Evidence:

> `def test_admin_permission_grants_require_active_verified_staff_targets(app_client, run_db, test_settings):`

Concrete test to add: in `backend/tests_fastapi/test_admin_overview.py`, add `test_unverified_staff_with_permission_cannot_access_staff_routes`. Seed `is_staff=True`, `is_email_verified=False`, and an active `roles:manage` or `finance:read` row; call `/api/admin/permissions` or `/api/payments/finance/ledger`; assert `403` with `"Staff access required"`.

### 4. HIGH - CMI callback provider-event redaction is untested

`backend/app/services/payment_gateway.py:275`

Evidence:

> `payload_json=_redacted_cmi_payload(normalized_payload),`

`backend/app/services/payment_gateway.py:2052`

Evidence:

> `def _redacted_cmi_payload(payload: dict[str, str]) -> dict[str, str]:`

`backend/app/services/payment_gateway.py:2053`

Evidence:

> `sensitive = {"cvv", "cvc", "storekey", "store_key", "cardnumber", "pan"}`

`backend/app/services/payment_gateway.py:2057`

Evidence:

> `redacted[key] = "[redacted]" if any(token in lowered for token in sensitive) else value`

Concrete test to add: in `backend/tests_fastapi/test_payments.py`, add `test_cmi_callback_redacts_sensitive_fields_in_provider_event`. Post an invalid-hash CMI callback containing `cardNumber`, `pan`, `cvv`, and `storekey`; assert the stored `PaymentProviderEvent.payload_json` has `"[redacted]"` for those keys and still keeps non-sensitive fields such as `oid`.

### 5. MEDIUM - Firestore async publish wrapper retry/config behavior is not covered

`backend/app/services/firestore_realtime.py:33`

Evidence:

> `if not settings.firebase_project_id.strip():`

`backend/app/services/firestore_realtime.py:39`

Evidence:

> `await asyncio.to_thread(_publish_firestore_message_sync, settings, channel, name, data)`

`backend/app/services/firestore_realtime.py:41`

Evidence:

> `except Exception:`

`backend/app/services/firestore_realtime.py:43`

Evidence:

> `return False`

Existing Firestore test calls only the sync writer:

`backend/tests_fastapi/test_firestore_realtime.py:46`

Evidence:

> `firestore_realtime._publish_firestore_message_sync(`

Concrete test to add: in `backend/tests_fastapi/test_firestore_realtime.py`, add `test_publish_firestore_message_retries_sync_writer_and_fails_closed`. Monkeypatch `_publish_firestore_message_sync` to raise once then succeed, monkeypatch `asyncio.sleep`, call `await publish_firestore_message(..., attempts=2)`, and assert it returns `True` after two calls. Add a second assertion that empty `firebase_project_id` raises `FirestoreRealtimeConfigurationError` before invoking the writer.

## Leads

1. `backend/tests_fastapi/test_auth.py` - Verify whether `/api/auth/firebase-session` needs route-level coverage for the Identity Toolkit fallback using `Settings.firebase_web_api_key`; `backend/tests_fastapi/test_auth_service.py` covers the service path, but the route currently calls `verify_firebase_token(credential, settings.firebase_project_id)`.
2. `backend/tests_fastapi/test_realtime.py` - Verify whether `/api/realtime/subscriptions` should include a regression test where a previously active `UserSubjectEntitlement` is changed to `status="revoked"` and the offering channel disappears from `notification_channels`.
