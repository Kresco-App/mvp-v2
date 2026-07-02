# Mobile Readiness

## Summary
- `git status --short` shows WIP only in `frontend/app/page.tsx` and `frontend/components/landing/`; no finding below touches those paths, so none are `[WIP-PROVISIONAL]`.
- Cookie-less bearer auth works for protected routes because `get_current_user` accepts `Authorization: Bearer` and CSRF globally exempts unsafe bearer requests with no `__session` cookie.
- The blocking mobile gap is session bootstrap: `/auth/firebase-session` still returns a cookie-shaped response, while the bearer token is only returned from the separate `/auth/mobile-session` endpoint.
- Logout, Firestore realtime authorization, and OpenAPI/export shape still carry web-cookie assumptions that mobile clients need resolved.

## Findings

1. HIGH - `/auth/firebase-session` cannot bootstrap a cookie-less mobile client with the Kresco JWT.
   - Evidence: `backend/app/schemas/users.py:34` defines `class AuthSessionOut(BaseModel):`, and `backend/app/schemas/users.py:36` only exposes `csrf_token: str = ""`.
   - Evidence: `backend/app/routers/users.py:155` returns `AuthSessionOut(user=_user_out(user, settings), csrf_token=csrf_token)` after `_auth_session_out` mints the token and sets cookies.
   - Evidence: `backend/app/routers/users.py:209` declares `@router.post("/auth/firebase-session", response_model=AuthSessionOut)`, while `backend/app/routers/users.py:196` separately declares `@router.post("/auth/mobile-session", response_model=MobileSessionOut)`.
   - Evidence: `backend/tests_fastapi/test_auth.py:190` asserts `assert "access_token" not in session_body` for `/api/auth/firebase-session`, while `backend/tests_fastapi/test_auth.py:216` asserts `assert body["access_token"]` only for `/api/auth/mobile-session`.
   - Concrete fix/spec: keep existing web behavior by default, but add an explicit mobile marker to `/auth/firebase-session`, preferably an OpenAPI-visible header parameter `X-Kresco-Client: mobile`. Extend the response schema used by this endpoint with optional `access_token: str | None`, `token_type: Literal["bearer"] | None`, and `expires_at: datetime | None`. When the marker is `mobile`, mint the same Kresco JWT as `create_token`, return those fields, set `csrf_token` to `""`, and do not call `_set_auth_cookies` or emit any `Set-Cookie`. Keep `/auth/mobile-session` as a compatibility alias or make it call the same no-cookie helper.

2. HIGH - Bearer-token logout does not revoke the mobile token.
   - Evidence: `backend/app/routers/users.py:235` declares `@router.post("/auth/logout", response_model=MessageOut)`.
   - Evidence: `backend/app/routers/users.py:243` calls `await revoke_cookie_session_if_valid(`, and `backend/app/routers/users.py:245` passes `token=request.cookies.get(AUTH_COOKIE_NAME)`.
   - Evidence: `backend/app/services/auth_sessions.py:15` names the helper `async def revoke_cookie_session_if_valid(`, and `backend/app/services/auth_sessions.py:41` revokes only after decoding that supplied token: `await revoke_user_sessions(db, user)`.
   - Concrete fix/spec: make logout revoke the authenticated session source, not just the cookie. Reuse the same precedence as `get_current_user`: if an `Authorization: Bearer` token is present, decode and validate that token, then increment `auth_token_version`; otherwise fall back to the cookie token. Add a regression test that logs out with only `Authorization: Bearer <token>` and no CSRF header, then proves the old bearer token returns `401 Token revoked` on `/api/profile/me`.

3. HIGH - Firestore realtime has no checked-in rules or membership contract for direct mobile reads.
   - Evidence: `frontend/lib/realtime.ts:247` subscribes directly to Firestore with `firestoreSdk.collection(firestore, 'realtimeChannels', firestoreChannelDocumentId(channelName), 'events')`.
   - Evidence: `backend/app/services/firestore_realtime.py:52` writes server events to `client.collection("realtimeChannels")`, and `backend/app/services/firestore_realtime.py:57` stores only `"channel": channel`, `"name": name`, `"data": data`, and `"createdAt": ...`.
   - Evidence: `firebase.json:2` contains only the top-level `"hosting": [` configuration; the full checked-in file has no `firestore.rules` or Firestore rules deployment entry.
   - Evidence: `frontend/lib/realtime.ts:339` has an empty authorization hook: `export async function refreshKrescoRealtimeAuthorization() {}`.
   - Concrete fix/spec: add a checked-in Firestore rules file and deploy configuration. Client reads to `realtimeChannels/{channelId}/events/{eventId}` must be denied unless `request.auth.uid` is mapped to that channel by a backend-maintained ACL document, for example `realtimeChannelMembers/{channelId}_{firebaseUid}` or `realtimeChannels/{channelId}/members/{firebaseUid}`. Client writes must be denied; backend Admin SDK writes bypass rules. The rules must use Firebase Auth UID, not the Kresco JWT, because Firestore clients do not send the Kresco bearer token to rules evaluation.

4. MEDIUM - The CSRF bearer exemption is correct for true cookie-less clients but fails if a mobile bearer request carries a stale `__session` cookie.
   - Evidence: `backend/app/security/csrf.py:112` starts `def csrf_failure_reason(request: Request, settings: Settings) -> str | None:`.
   - Evidence: `backend/app/security/csrf.py:120` exempts bearer only with `if _uses_bearer_auth(request) and AUTH_COOKIE_NAME not in request.cookies:`.
   - Evidence: `backend/app/security/csrf.py:122` then falls through to cookie CSRF behavior when `AUTH_COOKIE_NAME` is present: `if AUTH_COOKIE_NAME not in request.cookies:`.
   - Evidence: `backend/app/dependencies.py:36` authenticates with bearer first: `token = credentials.credentials if credentials is not None else request.cookies.get(AUTH_COOKIE_NAME)`.
   - Concrete fix/spec: the `/auth/firebase-session` mobile variant must not set cookies. Also add a targeted test for `Authorization: Bearer <valid>` plus a stale `__session` cookie and no Origin/CSRF header. Decide whether that mixed request should bypass CSRF because bearer wins authentication, or be explicitly unsupported with mobile clients clearing cookies after session exchange.

5. LOW - Mobile codegen has no stable exported OpenAPI artifact and production disables the schema endpoint.
   - Evidence: `backend/app/main.py:186` sets `openapi_url = None if settings.is_production_like else "/api/openapi.json"`.
   - Evidence: `backend/tests_fastapi/test_api_docs_routing.py:15` asserts `assert app_client.get("/api/openapi.json").status_code == 200` only in the non-production test app, and `backend/tests_fastapi/test_api_docs_routing.py:18` asserts `assert app_client.get("/openapi.json").status_code == 404`.
   - Evidence: `backend/app/dependencies.py:15` exposes the bearer scheme through `_bearer = HTTPBearer(auto_error=False)`, but `backend/app/routers/users.py:209` still advertises `/auth/firebase-session` as `response_model=AuthSessionOut`, which has no mobile token fields.
   - Concrete fix/spec: add a read-only schema export command or CI artifact, for example `backend/scripts/export_openapi.py`, that writes the current `create_app().openapi()` output for mobile codegen without exposing production docs. After the `/auth/firebase-session` mobile marker is added, ensure the generated OpenAPI includes the `X-Kresco-Client` enum parameter, optional bearer token response fields, and the existing `HTTPBearer` security scheme.

## Leads

1. `firebase.json` / Firebase console: verify the currently deployed Firestore Security Rules for staging and production at `realtimeChannels/{channelId}/events/{eventId}`; specifically record whether client reads are denied, open, or tied to Firebase Auth.
2. `backend/app/routers/users.py`: verify whether native mobile callers must use `/api/auth/firebase-session` immediately or can temporarily keep `/api/auth/mobile-session`; this determines whether `/auth/mobile-session` should be deprecated or retained indefinitely.
3. `frontend/lib/realtime.ts`: verify whether the native mobile app will subscribe directly to Firestore or use backend polling; direct Firestore requires Firebase Auth to remain signed in and rules to authorize `request.auth.uid` per channel.
