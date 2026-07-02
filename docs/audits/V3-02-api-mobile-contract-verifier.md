# API Mobile Contract Verification

## Summary

- Ran `git status --short` first. The relevant backend auth, router, schema, and test files are modified, and `backend/app/schemas/common.py` plus `docs/audits/` are untracked; findings against those files are marked `[WIP-PROVISIONAL]`.
- Verified `MobileSessionOut` includes bearer metadata: `backend/app/schemas/users.py:42` is `token_type: Literal["bearer"] = "bearer"`, and generated OpenAPI exposes `token_type` as `const: bearer`.
- Verified `/api/auth/mobile-session` remains cookie-less by code path and test: it returns `_mobile_session_out` from `backend/app/routers/users.py:208`, while the focused test asserts `response.headers.get("set-cookie") is None` at `backend/tests_fastapi/test_auth.py:218`.
- Verified logout revokes bearer tokens by code and tests: `backend/app/routers/users.py:246` prefers bearer credentials, `backend/app/routers/users.py:247` calls `revoke_session_token_if_valid`, and `backend/tests_fastapi/test_auth.py:743-745` proves the old bearer token returns `401` with `Token revoked`.
- Verified public mutation response models now produce non-empty OpenAPI schemas. Direct OpenAPI introspection returned `$ref` schemas for the seven target mutation responses.
- Verified `/api/internal/*` is hidden from public OpenAPI. `backend/app/routers/internal.py:15` sets `include_in_schema=False`, and direct OpenAPI introspection returned `internal_paths []`.
- Validation: direct OpenAPI introspection passed; focused pytest passed with `3 passed, 2 warnings` for `test_mobile_session_returns_bearer_token_without_cookies`, `test_logout_revokes_existing_bearer_token_without_cookie`, and `test_public_mutations_have_typed_success_schemas_and_internal_routes_are_hidden`.

## Findings - severity, exact file:line, quoted evidence, concrete fix

### LOW [WIP-PROVISIONAL] - `token_type` is present in code/OpenAPI but not pinned by the mobile-session response test

Evidence:
- `backend/app/schemas/users.py:42`: `token_type: Literal["bearer"] = "bearer"`
- `backend/tests_fastapi/test_auth.py:216`: `assert body["access_token"]`
- `backend/tests_fastapi/test_auth.py:217`: `assert "csrf_token" not in body`
- `backend/tests_fastapi/test_auth.py:218`: `assert response.headers.get("set-cookie") is None`

Concrete fix:
- Add `assert body["token_type"] == "bearer"` to `test_mobile_session_returns_bearer_token_without_cookies`.
- Optionally extend `test_public_mutations_have_typed_success_schemas_and_internal_routes_are_hidden` or a neighboring OpenAPI test to assert `MobileSessionOut.properties.token_type.const == "bearer"`.

## Leads - remaining questions or `None`

1. Product/API owner decision: should native mobile permanently use `/api/auth/mobile-session`, or should `/api/auth/firebase-session` become a dual web/mobile endpoint with an explicit mobile discriminator?
   - `backend/app/routers/users.py:198`: `@router.post("/auth/mobile-session", response_model=MobileSessionOut)`
   - `backend/app/routers/users.py:170`: `return MobileSessionOut(user=_user_out(user, settings), access_token=token, expires_at=expires_at)`
   - `backend/app/routers/users.py:211`: `@router.post("/auth/firebase-session", response_model=AuthSessionOut)`
   - `backend/app/routers/users.py:221`: `return await _auth_session_out(db, request=request, response=response, user=user, settings=settings)`
   - `backend/app/routers/users.py:148`: `csrf_token = _set_auth_cookies(`

2. Product/security decision: should bearer auth win CSRF classification when a stale `__session` cookie is also present, or should mixed bearer/cookie writes stay rejected and be documented as unsupported?
   - `backend/app/security/csrf.py:120`: `if _uses_bearer_auth(request) and AUTH_COOKIE_NAME not in request.cookies:`
   - `backend/app/dependencies.py:36`: `token = credentials.credentials if credentials is not None else request.cookies.get(AUTH_COOKIE_NAME)`
   - `backend/tests_fastapi/test_csrf.py:213`: `def test_bearer_write_does_not_require_csrf_token(app_client, auth_token):`
   - `backend/tests_fastapi/test_csrf.py:219`: `headers={"Authorization": f"Bearer {token}"},`
