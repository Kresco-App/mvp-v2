# Mobile Auth CSRF OpenAPI Follow-up

## Summary
- `git status --short` matched the orchestrator state: `M frontend/app/page.tsx`, `?? docs/audits/`, and `?? frontend/components/landing/`.
- No finding cites `frontend/app/page.tsx` or `frontend/components/landing/`, so no finding is marked `[WIP-PROVISIONAL]`.
- `/api/auth/mobile-session` can satisfy native Firebase-to-Kresco bearer bootstrap as implemented: it returns `access_token` and `expires_at` and does not set cookies. `/api/auth/firebase-session` cannot satisfy cookie-less native bootstrap as implemented: it sets web cookies and returns only `user` plus `csrf_token`.
- Bearer auth works on protected routes, and bearer writes without `__session` cookies bypass CSRF. Bearer-only logout does not revoke the bearer token, and bearer writes with a stale `__session` cookie are forced through cookie CSRF.
- OpenAPI is generated from the FastAPI app at runtime and exposed only outside production-like settings. Mobile codegen needs an exported schema artifact plus auth/logout/internal/public-mutation schema fixes.

## Findings - severity, exact file:line, quoted evidence, concrete fix/spec

### HIGH - Native bootstrap is split across two auth endpoints, and `/api/auth/firebase-session` remains web-cookie only

Evidence:
- `backend/app/routers/users.py:145`: `token = create_token(user, settings)`
- `backend/app/routers/users.py:146`: `csrf_token = _set_auth_cookies(`
- `backend/app/routers/users.py:155`: `return AuthSessionOut(user=_user_out(user, settings), csrf_token=csrf_token)`
- `backend/app/schemas/users.py:34`: `class AuthSessionOut(BaseModel):`
- `backend/app/schemas/users.py:36`: `csrf_token: str = ""`
- `backend/app/routers/users.py:209`: `@router.post("/auth/firebase-session", response_model=AuthSessionOut)`
- `backend/app/routers/users.py:196`: `@router.post("/auth/mobile-session", response_model=MobileSessionOut)`
- `backend/app/routers/users.py:164`: `token = create_token(user, settings)`
- `backend/app/routers/users.py:168`: `return MobileSessionOut(user=_user_out(user, settings), access_token=token, expires_at=expires_at)`
- `backend/app/schemas/users.py:39`: `class MobileSessionOut(BaseModel):`
- `backend/app/schemas/users.py:41`: `access_token: str`
- `backend/tests_fastapi/test_auth.py:190`: `assert "access_token" not in session_body`
- `backend/tests_fastapi/test_auth.py:192`: `assert "HttpOnly" in session.headers["set-cookie"]`
- `backend/tests_fastapi/test_auth.py:216`: `assert body["access_token"]`
- `backend/tests_fastapi/test_auth.py:218`: `assert response.headers.get("set-cookie") is None`

Concrete fix/spec:
- Make the native contract explicit. If native clients may use `/api/auth/mobile-session`, document that as the canonical mobile bootstrap path and add `token_type: Literal["bearer"] = "bearer"` to `MobileSessionOut` for standard generated-client handling.
- If native clients must use `/api/auth/firebase-session`, add an OpenAPI-visible discriminator such as `X-Kresco-Client: mobile` or `client_type: "mobile"` and return bearer fields on that branch without calling `_set_auth_cookies` or emitting `Set-Cookie`. Keep current cookie behavior as the default web branch.
- Add regression coverage for both branches: web `/api/auth/firebase-session` sets `__session` plus `kresco_csrf`; mobile bootstrap returns bearer fields and no cookies.

### HIGH - Bearer-only logout returns success but does not revoke the bearer session

Evidence:
- `backend/app/routers/users.py:235`: `@router.post("/auth/logout", response_model=MessageOut)`
- `backend/app/routers/users.py:243`: `await revoke_cookie_session_if_valid(`
- `backend/app/routers/users.py:245`: `token=request.cookies.get(AUTH_COOKIE_NAME),`
- `backend/app/services/auth_sessions.py:15`: `async def revoke_cookie_session_if_valid(`
- `backend/app/services/auth_sessions.py:21`: `if not token:`
- `backend/app/services/auth_sessions.py:22`: `return False`
- `backend/app/services/auth_sessions.py:41`: `await revoke_user_sessions(db, user)`
- `backend/app/dependencies.py:36`: `token = credentials.credentials if credentials is not None else request.cookies.get(AUTH_COOKIE_NAME)`
- `backend/app/dependencies.py:52`: `if (user.auth_token_version or 0) != token_payload.token_version:`
- `backend/app/dependencies.py:53`: `raise HTTPException(status_code=401, detail="Token revoked")`

Concrete fix/spec:
- Rename/generalize `revoke_cookie_session_if_valid` to revoke any supplied Kresco session token.
- In `logout`, extract the token with the same precedence as `get_current_user`: `Authorization: Bearer` first, then `__session`.
- Add an optional `HTTPBearer(auto_error=False)` dependency or explicit `Authorization` header parameter on logout so OpenAPI codegen knows bearer logout is supported.
- Preserve idempotent 200 logout for missing/invalid tokens so stale web cookies still clear.
- Add a test: create a mobile token, call `POST /api/auth/logout` with only `Authorization: Bearer <token>` and no CSRF/cookies, then assert the old token gets `401 Token revoked` on `GET /api/profile/me`.

### MEDIUM - CSRF correctly exempts bearer requests only when no `__session` cookie is present

Evidence:
- `backend/app/security/csrf.py:120`: `if _uses_bearer_auth(request) and AUTH_COOKIE_NAME not in request.cookies:`
- `backend/app/security/csrf.py:121`: `return None`
- `backend/app/security/csrf.py:122`: `if AUTH_COOKIE_NAME not in request.cookies:`
- `backend/app/security/csrf.py:123`: `return None`
- `backend/app/security/csrf.py:127`: `return "CSRF origin is required for cookie-authenticated writes"`
- `backend/app/security/csrf.py:134`: `return "CSRF token is required for cookie-authenticated writes"`
- `backend/app/security/csrf.py:140`: `auth_payload = decode_token(request.cookies[AUTH_COOKIE_NAME], settings)`
- `backend/app/security/csrf.py:146`: `return "CSRF token is invalid"`
- `backend/app/dependencies.py:36`: `token = credentials.credentials if credentials is not None else request.cookies.get(AUTH_COOKIE_NAME)`
- `backend/tests_fastapi/test_csrf.py:213`: `def test_bearer_write_does_not_require_csrf_token(app_client, auth_token):`
- `backend/tests_fastapi/test_csrf.py:219`: `headers={"Authorization": f"Bearer {token}"},`
- `backend/tests_fastapi/test_csrf.py:222`: `assert response.status_code == 200`

Concrete fix/spec:
- Current exact behavior: bearer plus no `__session` bypasses CSRF; bearer plus any `__session` cookie enters cookie-CSRF handling before `get_current_user` can apply bearer precedence.
- Preferred mobile spec: bearer auth should win CSRF classification. Change the exemption to bypass CSRF when a bearer header is present, regardless of stale cookies, then add a regression test with `Authorization: Bearer <valid>`, stale `__session`, no Origin, and no CSRF header.
- Alternative spec if mixed bearer/cookie requests are intentionally unsupported: keep the current behavior, document that native clients must clear all Kresco cookies, and add a regression test asserting the mixed request is rejected with the chosen 403 detail.

### MEDIUM - OpenAPI is runtime/dev-only and does not yet describe the mobile auth/logout contract

Evidence:
- `backend/app/main.py:184`: `docs_url = None if settings.is_production_like else "/api/docs"`
- `backend/app/main.py:185`: `redoc_url = None if settings.is_production_like else "/api/redoc"`
- `backend/app/main.py:186`: `openapi_url = None if settings.is_production_like else "/api/openapi.json"`
- `backend/app/main.py:197`: `app = FastAPI(`
- `backend/app/main.py:202`: `openapi_url=openapi_url,`
- `backend/tests_fastapi/test_api_docs_routing.py:14`: `def test_openapi_and_docs_served_under_api_prefix(app_client):`
- `backend/tests_fastapi/test_api_docs_routing.py:15`: `assert app_client.get("/api/openapi.json").status_code == 200`
- `backend/tests_fastapi/test_api_docs_routing.py:18`: `assert app_client.get("/openapi.json").status_code == 404`
- `backend/app/routers/users.py:209`: `@router.post("/auth/firebase-session", response_model=AuthSessionOut)`
- `backend/app/routers/users.py:235`: `@router.post("/auth/logout", response_model=MessageOut)`

Concrete fix/spec:
- Add a read-only export command, for example `backend/scripts/export_openapi.py`, that creates the non-production FastAPI app and writes `create_app().openapi()` to a committed or CI artifact used by mobile codegen.
- Keep production docs disabled; do not rely on production `/api/openapi.json` for codegen.
- After the auth/logout fixes, the exported schema must show the native bootstrap discriminator or `/api/auth/mobile-session` as the canonical mobile operation, bearer response fields including `token_type`, and bearer auth support for `/api/auth/logout`.

### MEDIUM - Internal worker routes are included in the generated schema with untyped responses

Evidence:
- `backend/app/main.py:252`: `app.include_router(internal.router, prefix="/api/internal")`
- `backend/app/routers/internal.py:15`: `router = APIRouter(tags=["Internal"])`
- `backend/app/routers/internal.py:19`: `x_kresco_internal_secret: str = Header(default=""),`
- `backend/app/routers/internal.py:29`: `@router.post("/realtime/process-outbox")`
- `backend/app/routers/internal.py:40`: `return {"ok": True, **result}`
- `backend/app/routers/internal.py:43`: `@router.post("/realtime/requeue-failed-outbox")`
- `backend/app/routers/internal.py:53`: `return {"ok": True, **result}`
- `backend/app/routers/internal.py:56`: `@router.post("/realtime/purge-outbox")`
- `backend/app/routers/internal.py:67`: `return {"ok": True, **result}`
- `backend/app/routers/internal.py:70`: `@router.post("/leaderboard/refresh")`
- `backend/app/routers/internal.py:81`: `return {"ok": True, "refreshed": refreshed}`
- `backend/app/routers/internal.py:84`: `@router.get("/diagnostics")`

Concrete fix/spec:
- Exclude internal worker routes from the mobile/public OpenAPI export with `include_in_schema=False` on the router include or internal route decorators.
- If any internal route must remain in a generated admin/internal client, add explicit Pydantic `response_model`s and make `x-kresco-internal-secret` a required header in that schema instead of `Header(default="")`.

### MEDIUM - Public mutation routes still need explicit response models before broad mobile codegen

Evidence:
- `backend/app/routers/courses.py:247`: `@router.post("/topic-items/{item_id}/complete")`
- `backend/app/services/course_topic_mutations.py:56`: `) -> dict[str, int | bool]:`
- `backend/app/services/course_topic_mutations.py:97`: `return {"ok": True, "xp_earned": xp_earned}`
- `backend/app/routers/gamification.py:168`: `@router.post("/daily-quests/{quest_id}/claim")`
- `backend/app/services/daily_quests.py:27`: `) -> dict[str, int | bool]:`
- `backend/app/services/daily_quests.py:75`: `return {"success": True, "xp_awarded": xp_awarded}`
- `backend/app/routers/notifications.py:36`: `@router.post("/read-all")`
- `backend/app/services/notifications.py:105`: `return {"ok": True}`
- `backend/app/routers/notifications.py:47`: `@router.delete("")`
- `backend/app/services/notifications.py:120`: `return {"ok": True}`
- `backend/app/routers/notifications.py:72`: `@router.delete("/{notification_id}")`
- `backend/app/services/notifications.py:139`: `return {"ok": True}`
- `backend/app/routers/professor.py:227`: `@router.delete("/live-sessions/{live_session_id}")`
- `backend/app/services/professor_live_sessions.py:488`: `) -> dict[str, bool]:`
- `backend/app/services/professor_live_sessions.py:507`: `return {"ok": True}`
- `backend/app/routers/professor.py:757`: `@router.delete("/chat/messages/{message_id}")`
- `backend/app/services/professor_chat_mutations.py:511`: `) -> dict[str, bool]:`
- `backend/app/services/professor_chat_mutations.py:540`: `return {"ok": True}`

Concrete fix/spec:
- Add explicit response schemas and `response_model` declarations: `TopicItemCompleteOut(ok: bool, xp_earned: int)`, `DailyQuestClaimOut(success: bool, xp_awarded: int)`, and a reusable `OkOut(ok: bool)` for the delete/read-all mutations.
- Add an OpenAPI regression check that fails if public 2xx responses emit an empty schema or an untyped object schema for these routes.

## Leads - precise remaining questions or `None`

1. API owner decision: should native mobile use `/api/auth/mobile-session` as the permanent canonical bootstrap endpoint, or must `/api/auth/firebase-session` become a dual web/mobile endpoint with an explicit mobile discriminator?
