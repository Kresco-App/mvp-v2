# Critical Test Design Follow-up

## Summary

- `git status --short` was run first and matched the orchestrator state: `M frontend/app/page.tsx`, `?? docs/audits/`, `?? frontend/components/landing/`.
- No finding below touches the modified/untracked frontend WIP files, so no finding is marked `[WIP-PROVISIONAL]`.
- All six scoped tests are obvious, low-risk regression tests to add now. They pin existing fail-closed behavior or existing redaction behavior; none require a product/security decision before implementation.
- The tests should be added to the existing backend suites that already own the adjacent behavior:
  - `backend/tests_fastapi/test_payments.py`: CMI merchant/currency binding and CMI provider-event redaction.
  - `backend/tests_fastapi/test_auth.py`: Firebase stale-token rejection after account merge.
  - `backend/tests_fastapi/test_admin_overview.py`: unverified staff actor with an active permission row.
  - `backend/tests_fastapi/test_firestore_realtime.py`: async Firestore publish retry/config behavior.
  - `backend/tests_fastapi/test_realtime.py`: revoked entitlement removes offering subscription channel.

## Findings

### 1. CRITICAL - CMI merchant/currency binding regression test is add-now low risk

Evidence:
- `backend/app/services/payment_gateway.py:286-288` computes `matches_transaction` by calling `_cmi_callback_matches_transaction(...)`.
- `backend/app/services/payment_gateway.py:344-352` marks a pending CMI transaction mismatch and returns `FAILURE` when `matches_transaction` is false.
- `backend/app/services/payment_gateway.py:1977-1985` rejects callbacks whose `clientid` does not equal configured CMI client id or whose `currency` is not `504`/`MAD`.
- `backend/tests_fastapi/test_payments.py:699-717` already has `_cmi_callback_payload(reference_code, **overrides)` that signs callbacks after applying overrides.
- `backend/tests_fastapi/test_payments.py:1636-1668` already tests the adjacent signed amount-mismatch path and asserts `PAYMENT_STATUS_MISMATCH`.

Exact test to add:
- File: `backend/tests_fastapi/test_payments.py`, near `test_cmi_callback_amount_mismatch_marks_mismatch_without_access`.
- Name: `test_cmi_callback_wrong_client_or_currency_marks_mismatch_without_access`.
- Fixtures/helpers to reuse: `app_client`, `auth_token`, `run_db`, `test_settings`, `_set_cmi_settings`, `_restore_settings`, `_cmi_callback_payload`, `_get_user`, `_payment_transactions_for_user`, `_subject_entitlements_for_user`, `_payment_provider_events_for_transaction`, `_finance_ledger_entries_for_transaction`.
- Shape: loop over two independent users/callbacks:
  - `("wrong-client", {"clientid": "other-client"})`
  - `("wrong-currency", {"currency": "840"})`
- For each case, create `/api/payments/payment-requests` with `{"payment_method": "cmi", "plan": "pro"}`, build the signed callback with the override and unique `TransId`, post `/api/payments/cmi/callback`, then assert:
  - create response is `200`;
  - callback response is `200` and body is `FAILURE`;
  - `run_db(_get_user(user_id)).is_pro is False`;
  - the only transaction has `status == PAYMENT_STATUS_MISMATCH` and `open_request_key is None`;
  - `run_db(_subject_entitlements_for_user(user_id)) == []`;
  - one provider event exists with `status == "failed"`;
  - one ledger entry exists with `entry_type == "payment_mismatch"`.

### 2. HIGH - CMI provider-event redaction regression test is add-now low risk

Evidence:
- `backend/app/services/payment_gateway.py:259-275` stores invalid CMI callbacks as provider events with `payload_json=_redacted_cmi_payload(normalized_payload)`.
- `backend/app/services/payment_gateway.py:2052-2058` redacts keys containing `cvv`, `cvc`, `storekey`, `store_key`, `cardnumber`, or `pan`.
- `backend/tests_fastapi/test_payments.py:1493-1524` already posts an invalid-hash CMI callback and verifies the pending transaction is not mutated.
- `backend/tests_fastapi/test_payments.py:406-414` already has `_payment_provider_events_for_transaction(...)`.

Exact test to add:
- File: `backend/tests_fastapi/test_payments.py`, near invalid-hash CMI callback tests.
- Name: `test_cmi_callback_redacts_sensitive_fields_in_provider_event`.
- Fixtures/helpers to reuse: `app_client`, `auth_token`, `run_db`, `test_settings`, `_set_cmi_settings`, `_restore_settings`, `_cmi_callback_payload`, `_payment_transactions_for_user`, `_payment_provider_events_for_transaction`, `_finance_ledger_entries_for_transaction`.
- Shape: create a CMI payment request, build a callback with `cardNumber`, `pan`, `cvv`, `storekey`, and a non-sensitive field such as `customerEmail`, then set `callback["HASH"] = "tampered"`.
- Assert:
  - callback response is `200` and body is `FAILURE`;
  - transaction remains `PAYMENT_STATUS_PENDING_PROVIDER`;
  - one event exists with `event_type == "cmi.callback.invalid"`;
  - event payload has `"[redacted]"` for `cardNumber`, `pan`, `cvv`, and `storekey`;
  - event payload still keeps `oid`, `TransId`, and `customerEmail`;
  - raw sensitive values are absent from `str(event.payload_json)`;
  - no finance ledger entries were created.

### 3. HIGH - Firebase stale-token rejection after verified merge is add-now low risk

Evidence:
- `backend/app/services/auth_firebase.py:139-141` increments `auth_token_version` when an existing unverified user becomes verified through Firebase.
- `backend/app/dependencies.py:52-53` rejects any token whose embedded version no longer matches the user row with `401 Token revoked`.
- `backend/app/routers/users.py:209-219` routes `/api/auth/firebase-session` through `_firebase_session_user(...)` and returns the auth session.
- `backend/tests_fastapi/test_auth.py:548-571` already verifies Firebase login normalizes and links an existing unverified user.
- `backend/tests_fastapi/test_auth.py:680-694` already verifies an old bearer token gets `401 Token revoked` after logout increments token state.

Exact test to add:
- File: `backend/tests_fastapi/test_auth.py`, after `test_firebase_login_normalizes_email_and_links_existing_user`.
- Name: `test_firebase_login_verifying_existing_user_revokes_old_token`.
- Fixtures/helpers to reuse: `app_client`, `monkeypatch`, `run_db`, `test_settings`, `_seed_user`, `_get_user`, `_firebase_google_payload`, `create_token`.
- Shape:
  - seed `email = "firebase-stale-token@example.com"` with `is_email_verified=False`;
  - fetch the seeded user with `_get_user(email)` and mint `old_token = create_token(user, test_settings)` before Firebase login;
  - monkeypatch `app.routers.users.verify_firebase_token` to return `_firebase_google_payload(email, google_id="google-stale-token-sub", firebase_uid="firebase-stale-token-uid")`;
  - post `/api/auth/firebase-session`;
  - call `/api/profile/me` once with `Authorization: Bearer {old_token}` and once without the header so the newly issued session cookie is used.
- Assert:
  - Firebase session response is `200`;
  - persisted user is verified and has `auth_token_version == 1`;
  - stale bearer profile response is `401` with `{"detail": "Token revoked"}`;
  - fresh cookie profile response is `200` and returns the same email.

### 4. HIGH - Unverified permissioned staff actor boundary test is add-now low risk

Evidence:
- `backend/app/dependencies.py:80-84` rejects users who are not staff or not email-verified before permission lookup.
- `backend/app/dependencies.py:111-118` wires `require_staff_permission(...)` through `get_current_staff_user` before `user_has_permission`.
- `backend/app/routers/admin.py:76-77` defines `require_roles_manage = require_staff_permission("roles:manage")`.
- `backend/app/routers/admin.py:278-284` protects `GET /api/admin/permissions` with `require_roles_manage`.
- `backend/tests_fastapi/test_admin_overview.py:1266-1329` covers invalid permission targets, but not an unverified actor who already has an active permission row.

Exact test to add:
- File: `backend/tests_fastapi/test_admin_overview.py`, near permission-management tests.
- Name: `test_unverified_staff_with_permission_cannot_access_staff_routes`.
- Fixtures/helpers to reuse: `app_client`, `run_db`, `test_settings`, `get_session_factory`, `User`, `UserPermission`, `create_token`.
- Shape: seed one user with `is_staff=True`, `is_active=True`, `is_email_verified=False`; add an active `UserPermission(user_id=actor.id, permission="roles:manage", status="active", reason="seed unverified actor", granted_by_user_id=actor.id)`; return `create_token(actor.id, test_settings)`.
- Request: `GET /api/admin/permissions` with that bearer token.
- Assert:
  - response is `403`;
  - response detail is exactly `"Staff access required"`;
  - do not assert `"Permission required: roles:manage"` because the boundary being pinned is that verification fails before permission lookup.

### 5. MEDIUM - Firestore async retry/config wrapper test is add-now low risk

Evidence:
- `backend/app/services/firestore_realtime.py:22-45` rejects missing `firebase_project_id`, runs the sync writer through `asyncio.to_thread`, sleeps between failed attempts, returns `True` after success, and returns `False` after exhausted attempts.
- `backend/tests_fastapi/test_firestore_realtime.py:7-65` currently covers only `_publish_firestore_message_sync(...)` with fake Firestore modules.

Exact test to add:
- File: `backend/tests_fastapi/test_firestore_realtime.py`, after `test_publish_firestore_message_writes_channel_event`.
- Name: `test_publish_firestore_message_retries_sync_writer_and_fails_closed`.
- Fixtures/helpers to reuse: `monkeypatch`, `run_db`, `test_settings`, existing `firestore_realtime` import.
- No Google module fakes are needed because the test monkeypatches `_publish_firestore_message_sync`.
- Shape:
  - create `settings = test_settings.model_copy(update={"firebase_project_id": "kresco-staging"})`;
  - monkeypatch `firestore_realtime._publish_firestore_message_sync` to raise on the first call and succeed on the second;
  - monkeypatch `firestore_realtime.asyncio.sleep` to an async fake that records delays;
  - call `run_db(firestore_realtime.publish_firestore_message(settings, "kresco:user:1:notifications", "chat.message", {"message_id": 123}, attempts=2, retry_delay_seconds=0.01))`.
- Assert transient case:
  - result is `True`;
  - sync writer was called twice with the expected channel/name/data;
  - recorded sleeps are `[0.01]`.
- Then monkeypatch the writer to always raise and assert the same publish call with `attempts=2` returns `False` after two writer calls.
- Then create `empty_settings = test_settings.model_copy(update={"firebase_project_id": " "})`, call the publisher, catch `FirestoreRealtimeConfigurationError`, assert the message contains `FIREBASE_PROJECT_ID`, and assert the writer was not called for that config-error branch.

### 6. MEDIUM - Revoked entitlement removes realtime offering channel test is add-now low risk

Evidence:
- `backend/app/models/users.py:64-73` models `UserSubjectEntitlement.status`, defaulting to `active`.
- `backend/app/services/access.py:83-92` exposes `subject_scope_enforced` as true when any entitlement rows exist or active subject ids are present.
- `backend/app/services/access.py:176-192` loads all entitlement rows but only includes `_is_active_entitlement(...)` rows in `active_subject_ids`.
- `backend/app/services/access.py:223-225` treats any status other than `active` as inactive.
- `backend/app/services/realtime_access.py:28-33` applies `CourseOffering.subject_id.in_(access_context.active_subject_ids)` when subject scope is enforced.
- `backend/app/services/realtime_access.py:118-122` builds notification channels from `offering_ids_for_user(...)`.
- `backend/tests_fastapi/test_realtime.py:22-65` already seeds a live offering plus active `UserSubjectEntitlement`.
- `backend/tests_fastapi/test_realtime.py:124-135` already verifies an accessible offering channel is included.

Exact test to add:
- File: `backend/tests_fastapi/test_realtime.py`, after `test_realtime_subscriptions_include_user_and_accessible_offering_channels`.
- Name: `test_realtime_subscriptions_remove_offering_channel_after_entitlement_revoked`.
- Fixtures/helpers to reuse: `app_client`, `run_db`, `test_settings`, `_seed_live_session_for_realtime`, `get_session_factory`, `CourseOffering`, `UserSubjectEntitlement`.
- Required import adjustment: change `from sqlalchemy import delete` to `from sqlalchemy import delete, select`.
- Add helper:
  - `async def _revoke_subject_entitlements_for_offering(offering_id: int) -> None:`
  - load `offering = await db.get(CourseOffering, offering_id)`;
  - select entitlements where `UserSubjectEntitlement.subject_id == offering.subject_id`;
  - set each selected entitlement `status = "revoked"`;
  - commit.
- Test shape:
  - seed with `_seed_live_session_for_realtime(test_settings, student_tier="vip")`;
  - request `/api/realtime/subscriptions` and assert `kresco:offering:{offering_id}:notifications` is present;
  - run `_revoke_subject_entitlements_for_offering(offering_id)`;
  - request `/api/realtime/subscriptions` again with the same token.
- Assert:
  - second response is `200`;
  - user notification channel is still present;
  - `kresco:offering:{offering_id}:notifications` is absent after revocation.

## Leads

None.
