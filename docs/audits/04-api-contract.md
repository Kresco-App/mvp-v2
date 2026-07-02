# API Contract
## Summary - max 5 lines
- Audited FastAPI 0.136.1/Pydantic 2 backend contracts against the hand-written Next 16/React 19 frontend API clients.
- Current WIP files are `frontend/app/page.tsx` and `frontend/components/landing/`; no finding below cites those files, so no finding is WIP-provisional.
- The largest mobile-codegen risk is public mutation endpoints whose generated OpenAPI success schemas are empty.
- One active frontend/backend drift exists in the resource-open contract and endpoint fallback.
- Error responses are not yet a stable generated-client contract.

## Findings

### HIGH - Public mutation endpoints return ad-hoc payloads without response models

FastAPI generates empty 200-response schemas for these mutations because the route decorators omit `response_model`, even though services and frontend callers rely on concrete payloads. This is not ready for OpenAPI client codegen because the generated mobile client would not know the success response shape for common write operations.

Evidence:
- `backend/app/routers/courses.py:247`: `@router.post("/topic-items/{item_id}/complete")`
- `backend/app/services/course_topic_mutations.py:97`: `return {"ok": True, "xp_earned": xp_earned}`
- `frontend/app/(dashboard)/topics/[topicId]/page.tsx:234`: `` const data = await postJson<any>(`/courses/topic-items/${activeItem.id}/complete`, { watched_seconds: activeItem.duration_seconds || 0 }) ``
- `backend/app/routers/gamification.py:168`: `@router.post("/daily-quests/{quest_id}/claim")`
- `backend/app/services/daily_quests.py:75`: `return {"success": True, "xp_awarded": xp_awarded}`
- `frontend/components/figma/permanent-sidebar.tsx:120`: `` const result = await postJson<{ xp_awarded?: number }>(`/progress/daily-quests/${quest.id}/claim`) ``
- `backend/app/routers/notifications.py:36`: `@router.post("/read-all")`
- `backend/app/routers/notifications.py:47`: `@router.delete("")`
- `backend/app/routers/notifications.py:72`: `@router.delete("/{notification_id}")`
- `backend/app/services/notifications.py:105`: `return {"ok": True}`
- `backend/app/services/notifications.py:120`: `return {"ok": True}`
- `backend/app/services/notifications.py:139`: `return {"ok": True}`
- `backend/app/routers/professor.py:227`: `@router.delete("/live-sessions/{live_session_id}")`
- `backend/app/services/professor_live_sessions.py:507`: `return {"ok": True}`
- `backend/app/routers/professor.py:757`: `@router.delete("/chat/messages/{message_id}")`
- `backend/app/services/professor_chat_mutations.py:540`: `return {"ok": True}`
- `frontend/lib/professor.ts:252`: `` return deleteJson<{ ok: boolean }>(`/professor/live-sessions/${id}`) ``
- `frontend/lib/professor.ts:364`: `` await deleteJson(`/professor/chat/messages/${messageId}`) ``

Concrete fix:
Define explicit Pydantic response schemas, for example `TopicItemCompleteOut(ok: bool, xp_earned: int)`, `DailyQuestClaimOut(success: bool, xp_awarded: int)`, and a reusable `OkOut(ok: bool)`. Add `response_model=...` to each listed route decorator, replace frontend `any` and implicit void calls with generated or mirrored types, and fail CI if `app.openapi()` emits `{}` for public 2xx mutation responses.

### MEDIUM - Resource-open frontend contract does not match the backend schema and includes an unregistered fallback endpoint

The backend resource-open endpoint returns a progress/event payload, but the frontend type looks for URL fields and tries a second `/api/resources/...` endpoint that is not registered by the FastAPI app. This creates both runtime fallback noise and a misleading mobile contract for resource opening.

Evidence:
- `backend/app/main.py:238`: `app.include_router(courses.router, prefix="/api/courses")`
- `backend/app/routers/courses.py:301`: `@router.post("/resources/{resource_id}/open", response_model=ResourceOpenOut)`
- `backend/app/schemas/interactions.py:180`: `class ResourceOpenOut(BaseModel):`
- `backend/app/schemas/interactions.py:181`: `ok: bool`
- `backend/app/schemas/interactions.py:182`: `resource_id: int`
- `backend/app/schemas/interactions.py:190`: `opened_at: datetime`
- `frontend/lib/topicWorkspaceResources.ts:13`: `type TopicWorkspaceResourceOpenResponse = {`
- `frontend/lib/topicWorkspaceResources.ts:14`: `url?: string`
- `frontend/lib/topicWorkspaceResources.ts:15`: `href?: string`
- `frontend/lib/topicWorkspaceResources.ts:16`: `location?: string`
- `frontend/lib/topicWorkspaceResources.ts:17`: `open_url?: string`
- `frontend/lib/topicWorkspaceResources.ts:18`: `preview_url?: string`
- `frontend/lib/topicWorkspaceResources.ts:19`: `download_url?: string`
- `frontend/lib/topicWorkspaceResources.ts:30`: `` `/courses/resources/${resourceId}/open`, ``
- `frontend/lib/topicWorkspaceResources.ts:31`: `` `/resources/${resourceId}/open`, ``
- `frontend/lib/topicWorkspaceResources.ts:70`: `const response = await postJson<TopicWorkspaceResourceOpenResponse>(endpoint, body)`

Concrete fix:
Replace `TopicWorkspaceResourceOpenResponse` with a frontend type generated from `ResourceOpenOut` or a direct mirror containing `ok`, `resource_id`, `title`, `resource_type`, topic/tab identifiers, `progress_status`, and `opened_at`. Remove `/resources/${resourceId}/open` unless the backend intentionally adds a compatibility router under `/api/resources/{resource_id}/open`; keep any downloadable URL fallback derived from the original resource object, not from the open response.

### LOW - Error response shapes are mixed and the frontend helper only handles string details

The backend exposes custom string-detail errors with request metadata, while request validation can produce FastAPI validation payloads; the shared frontend error helper only extracts string `detail` or `message`. A generated mobile client would inherit multiple undocumented error shapes.

Evidence:
- `frontend/lib/apiData.ts:29`: `const detail = maybeError?.response?.data?.detail`
- `frontend/lib/apiData.ts:30`: `if (typeof detail === 'string' && detail.trim()) return detail`
- `frontend/lib/apiData.ts:31`: `const message = maybeError?.response?.data?.message`
- `backend/app/main.py:335`: `content={"detail": "Internal server error", "request_id": request_id, "release_sha": release_sha},`
- `backend/app/routers/notifications.py:28`: `limit: int = Query(default=20, ge=1, le=100),`

Concrete fix:
Introduce a documented error envelope, for example `ApiErrorOut(detail: str, request_id: str | None = None, code: str | None = None)`, and a validation-error representation if the app keeps FastAPI-style validation details. Add route/global `responses={...}` coverage for common 4xx/5xx responses, update `extractApiErrorMessage` to preserve validation messages and `request_id`, and use the same schema as the mobile client error model.

## Leads

1. `backend/app/routers/internal.py:29`: Verify whether `/api/internal/realtime/process-outbox`, `/api/internal/realtime/requeue-failed-outbox`, `/api/internal/realtime/purge-outbox`, `/api/internal/leaderboard/refresh`, and `/api/internal/diagnostics` should be excluded from mobile/public OpenAPI with `include_in_schema=False` or typed with response models before codegen.
2. `backend/app/main.py:186`: Verify the exact OpenAPI source for mobile codegen because production-like settings set `openapi_url = None`, while `backend/tests_fastapi/test_api_docs_routing.py:15` asserts `/api/openapi.json` only for the test/dev app.
3. `frontend/lib/topicWorkspaceResources.ts:31`: Verify whether `/resources/${resourceId}/open` is an intentional legacy compatibility endpoint; if yes, add the backend route with `ResourceOpenOut`, and if no, remove the fallback from the frontend client.
4. `frontend/lib/apiData.ts:29`: Verify the final mobile error contract, specifically whether clients must preserve backend `request_id` values from `backend/app/main.py:335` and validation errors from query-validated routes like `backend/app/routers/notifications.py:28`.
