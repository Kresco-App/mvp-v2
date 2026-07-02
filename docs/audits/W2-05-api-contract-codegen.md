# API Contract Codegen Follow-up

## Summary

- Ran `git status --short` first. Current WIP is `frontend/app/page.tsx`, `docs/audits/`, and `frontend/components/landing/`; no finding below cites WIP source files, so no finding is marked `[WIP-PROVISIONAL]`.
- Verified the Wave 1 API-contract leads against full source files and `create_app(Settings()).openapi()` from `backend/`.
- Public mutation codegen is still blocked: the listed non-204 mutations generate `schema: {}` for 200 responses.
- Internal `/api/internal/*` routes are included in the public OpenAPI and also generate empty 200 schemas.
- Resource-open fallback is intentionally encoded in frontend tests, but only the `/api/courses/resources/{resource_id}/open` backend route exists and its response schema is not URL-shaped.
- Error responses are not yet one generated-client envelope: string `detail`, validation-array `detail`, and 500 `detail/request_id/release_sha` bodies coexist.

## Findings - severity, exact file:line, quoted evidence, concrete code change

### HIGH - Public mutation endpoints still emit empty success schemas for generated clients

Generated verification: `create_app(Settings()).openapi()` returns `{'schema': {}}` for each 200 success response on these paths: `POST /api/courses/topic-items/{item_id}/complete`, `POST /api/progress/daily-quests/{quest_id}/claim`, `POST /api/notifications/read-all`, `DELETE /api/notifications`, `DELETE /api/notifications/{notification_id}`, `DELETE /api/professor/live-sessions/{live_session_id}`, and `DELETE /api/professor/chat/messages/{message_id}`.

Evidence:

- `backend/app/routers/courses.py:247`: `@router.post("/topic-items/{item_id}/complete")`
- `backend/app/services/course_topic_mutations.py:97`: `return {"ok": True, "xp_earned": xp_earned}`
- `frontend/app/(dashboard)/topics/[topicId]/page.tsx:234`: ``const data = await postJson<any>(`/courses/topic-items/${activeItem.id}/complete`, { watched_seconds: activeItem.duration_seconds || 0 })``
- `backend/app/routers/gamification.py:168`: `@router.post("/daily-quests/{quest_id}/claim")`
- `backend/app/services/daily_quests.py:75`: `return {"success": True, "xp_awarded": xp_awarded}`
- `frontend/components/figma/permanent-sidebar.tsx:120`: ``const result = await postJson<{ xp_awarded?: number }>(`/progress/daily-quests/${quest.id}/claim`)``
- `backend/app/routers/notifications.py:36`: `@router.post("/read-all")`
- `backend/app/routers/notifications.py:47`: `@router.delete("")`
- `backend/app/routers/notifications.py:72`: `@router.delete("/{notification_id}")`
- `backend/app/services/notifications.py:105`: `return {"ok": True}`
- `backend/app/services/notifications.py:120`: `return {"ok": True}`
- `backend/app/services/notifications.py:139`: `return {"ok": True}`
- `frontend/lib/notifications.ts:31`: `await postJson('/notifications/read-all')`
- `frontend/lib/notifications.ts:35`: ``await deleteJson(`/notifications/${id}`)``
- `frontend/lib/notifications.ts:44`: `await deleteJson('/notifications', { params: { confirmation_token } })`
- `backend/app/routers/professor.py:227`: `@router.delete("/live-sessions/{live_session_id}")`
- `backend/app/services/professor_live_sessions.py:507`: `return {"ok": True}`
- `frontend/lib/professor.ts:252`: ``return deleteJson<{ ok: boolean }>(`/professor/live-sessions/${id}`)``
- `backend/app/routers/professor.py:757`: `@router.delete("/chat/messages/{message_id}")`
- `backend/app/services/professor_chat_mutations.py:540`: `return {"ok": True}`
- `frontend/lib/professor.ts:364`: ``await deleteJson(`/professor/chat/messages/${messageId}`)``

Reusable-schema check:

- `backend/app/schemas/courses.py:150`: `class TopicItemProgressOut(BaseModel):`
- `backend/app/schemas/courses.py:151`: `ok: bool = True`
- `backend/app/schemas/courses.py:152`: `watched_seconds: int = 0`
- `backend/app/schemas/courses.py:153`: `completed: bool = False`
- `backend/app/schemas/interactions.py:170`: `class InteractionDeleteOut(BaseModel):`
- `backend/app/schemas/interactions.py:171`: `ok: bool`
- `backend/app/schemas/interactions.py:172`: `id: int`
- `backend/app/schemas/users.py:49`: `class MessageOut(BaseModel):`
- `backend/app/schemas/users.py:50`: `message: str`

Those are close patterns but not exact reusable models for `ok/xp_earned`, `success/xp_awarded`, or ok-only deletes.

Concrete code change:

Add exact response schemas and attach them to the route decorators:

- `TopicItemCompleteOut(ok: bool = True, xp_earned: int = 0)` in `backend/app/schemas/courses.py`, then `@router.post(..., response_model=TopicItemCompleteOut)`.
- `DailyQuestClaimOut(success: bool = True, xp_awarded: int = 0)` in `backend/app/schemas/gamification.py`, then `@router.post(..., response_model=DailyQuestClaimOut)`.
- A shared `OkOut(ok: bool = True)` or module-local ok-only schema for notification deletes/read-all, professor live deletion, and chat message deletion.
- Replace frontend `any`/implicit `unknown` calls with those exact response types or generated-client types.
- Add a focused OpenAPI assertion that non-204 public mutation 2xx responses do not emit `{}` schemas.

### HIGH - Internal endpoints are exposed in public/mobile OpenAPI and are untyped

Generated verification: `create_app(Settings()).openapi()` includes all five `/api/internal/*` operations with tag `Internal`; each 200 response has `{'schema': {}}`.

Evidence:

- `backend/app/main.py:252`: `app.include_router(internal.router, prefix="/api/internal")`
- `backend/app/routers/internal.py:15`: `router = APIRouter(tags=["Internal"])`
- `backend/app/routers/internal.py:18`: `def _require_internal_secret(`
- `backend/app/routers/internal.py:24`: `raise HTTPException(status_code=503, detail="Internal worker secret is not configured")`
- `backend/app/routers/internal.py:26`: `raise HTTPException(status_code=403, detail="Forbidden")`
- `backend/app/routers/internal.py:29`: `@router.post("/realtime/process-outbox")`
- `backend/app/routers/internal.py:40`: `return {"ok": True, **result}`
- `backend/app/routers/internal.py:43`: `@router.post("/realtime/requeue-failed-outbox")`
- `backend/app/routers/internal.py:53`: `return {"ok": True, **result}`
- `backend/app/routers/internal.py:56`: `@router.post("/realtime/purge-outbox")`
- `backend/app/routers/internal.py:67`: `return {"ok": True, **result}`
- `backend/app/routers/internal.py:70`: `@router.post("/leaderboard/refresh")`
- `backend/app/routers/internal.py:81`: `return {"ok": True, "refreshed": refreshed}`
- `backend/app/routers/internal.py:84`: `@router.get("/diagnostics")`
- `backend/app/routers/internal.py:94`: `return await build_production_diagnostics(`

Concrete code change:

For the public/mobile OpenAPI artifact, hide this router with `router = APIRouter(tags=["Internal"], include_in_schema=False)` or `app.include_router(internal.router, prefix="/api/internal", include_in_schema=False)`. If worker tooling needs codegen, publish a separate internal OpenAPI artifact and add typed internal response models there; do not let `/api/internal/*` appear in the mobile client surface with empty success schemas.

### MEDIUM - Resource-open fallback is intentional in frontend tests but unregistered on the backend and mismatched to `ResourceOpenOut`

Generated verification: backend OpenAPI contains only `/api/courses/resources/{resource_id}/open` for resource-open; there is no `/api/resources/{resource_id}/open` path.

Evidence:

- `backend/app/main.py:238`: `app.include_router(courses.router, prefix="/api/courses")`
- `backend/app/routers/courses.py:301`: `@router.post("/resources/{resource_id}/open", response_model=ResourceOpenOut)`
- `backend/app/schemas/interactions.py:180`: `class ResourceOpenOut(BaseModel):`
- `backend/app/schemas/interactions.py:181`: `ok: bool`
- `backend/app/schemas/interactions.py:182`: `resource_id: int`
- `backend/app/schemas/interactions.py:189`: `progress_status: str = "not_tracked"`
- `backend/app/schemas/interactions.py:190`: `opened_at: datetime`
- `frontend/lib/topicWorkspaceResources.ts:13`: `type TopicWorkspaceResourceOpenResponse = {`
- `frontend/lib/topicWorkspaceResources.ts:17`: `open_url?: string`
- `frontend/lib/topicWorkspaceResources.ts:18`: `preview_url?: string`
- `frontend/lib/topicWorkspaceResources.ts:19`: `download_url?: string`
- `frontend/lib/topicWorkspaceResources.ts:28`: `export function topicWorkspaceResourceOpenEndpointCandidates(resourceId: number) {`
- `frontend/lib/topicWorkspaceResources.ts:30`: `` `/courses/resources/${resourceId}/open`,``
- `frontend/lib/topicWorkspaceResources.ts:31`: `` `/resources/${resourceId}/open`,``
- `frontend/tests/topicWorkspaceResources.test.ts:58`: `it('falls back to the raw resource URL when open endpoints are unavailable', async () => {`
- `frontend/tests/topicWorkspaceResources.test.ts:64`: `expect(mocks.apiPost).toHaveBeenNthCalledWith(1, '/courses/resources/22/open', {})`
- `frontend/tests/topicWorkspaceResources.test.ts:65`: `expect(mocks.apiPost).toHaveBeenNthCalledWith(2, '/resources/22/open', {})`
- `frontend/tests/topicWorkspaceResources.test.ts:68`: `it('normalizes open-endpoint response shapes and candidate order', () => {`
- `frontend/tests/topicWorkspaceResources.test.ts:69`: `expect(topicWorkspaceResourceOpenEndpointCandidates(5)).toEqual([`

Concrete code change:

Pick one contract and make codegen match it:

- If `/resources/{resource_id}/open` is legacy compatibility, add a backend alias under `/api/resources/{resource_id}/open` with `response_model=ResourceOpenOut` and include it in OpenAPI intentionally.
- If it is not legacy compatibility, remove the second frontend candidate and update `frontend/tests/topicWorkspaceResources.test.ts`.
- In both cases, change `TopicWorkspaceResourceOpenResponse` to mirror `ResourceOpenOut`; derive navigation from the existing `Resource.url` unless the backend explicitly extends `ResourceOpenOut` with typed `open_url`, `preview_url`, and `download_url` fields.

### MEDIUM - Error responses are not a stable generated-client envelope

Generated verification: OpenAPI publishes FastAPI's validation model for 422 (`HTTPValidationError.detail: ValidationError[]`), while custom runtime responses in source use string `detail` and the unhandled 500 handler adds `request_id` and `release_sha`.

Evidence:

- `backend/app/main.py:264`: `return _apply_security_headers(JSONResponse(status_code=403, content={"detail": reason}))`
- `backend/app/main.py:302`: `response.headers["x-request-id"] = request_id`
- `backend/app/main.py:303`: `response.headers["x-release-sha"] = release_sha`
- `backend/app/main.py:335`: `content={"detail": "Internal server error", "request_id": request_id, "release_sha": release_sha},`
- `backend/app/routers/notifications.py:28`: `limit: int = Query(default=20, ge=1, le=100),`
- `frontend/lib/apiData.ts:27`: `export function apiDataErrorMessage(error: unknown, fallback: string) {`
- `frontend/lib/apiData.ts:29`: `const detail = maybeError?.response?.data?.detail`
- `frontend/lib/apiData.ts:30`: `if (typeof detail === 'string' && detail.trim()) return detail`
- `frontend/lib/apiData.ts:31`: `const message = maybeError?.response?.data?.message`
- `frontend/lib/apiData.ts:36`: `return fallback`
- `frontend/lib/axios.ts:91`: `// Global error handler`
- `frontend/lib/axios.ts:103`: `return Promise.reject(error)`

Concrete code change:

Define the generated-client error contract explicitly:

- Add backend error schemas such as `ApiErrorOut(detail: str, code: str | None = None, request_id: str | None = None, release_sha: str | None = None)` and `ApiValidationErrorOut(detail: list[ValidationErrorOut], code: Literal["validation_error"], request_id: str | None = None)`.
- Register exception handlers for `HTTPException`, `RequestValidationError`, request-size failures, and 500s so every API error includes the same request-id field or a documented `x-request-id` header.
- Add app/router-level OpenAPI `responses` for common 4xx/5xx cases so generated clients model string errors and validation errors deliberately.
- Update `apiDataErrorMessage` and generated mobile-client glue to handle string `detail`, validation-array `detail`, and request-id preservation instead of dropping non-string detail bodies.

## Leads - precise remaining questions or `None`

None.
