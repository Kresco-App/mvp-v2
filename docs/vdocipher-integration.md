# VdoCipher Integration

## Current Implementation

VdoCipher OTP generation is implemented in:

- Service: `backend/app/services/vdocipher.py`
- Compatibility stream endpoints: `backend/app/routers/courses.py`

Current implemented stream endpoints:

- `GET /api/courses/lessons/{lesson_id}/stream`
- `GET /api/courses/sections/{section_id}/stream`

These endpoints validate access before requesting a VdoCipher OTP.

## Required Environment

Set this in the backend environment:

```text
VDOCIPHER_API_SECRET=
VDOCIPHER_API_BASE_URL=https://dev.vdocipher.com/api
VDOCIPHER_LIVE_CREATE_URL=
VDOCIPHER_LIVE_DELETE_URL=
```

Do not expose this value to the frontend.

## Current Service Contract

`get_video_otp(vdocipher_id, settings)`:

- Rejects missing video ids with `404`.
- Calls `${VDOCIPHER_API_BASE_URL}/videos/{id}/otp`.
- Uses `ttl=300`.
- Returns:

```json
{
  "otp": "...",
  "playback_info": "..."
}
```

`create_live_stream(title, settings)`:

- Uses `VDOCIPHER_LIVE_CREATE_URL` for professor live-session auto-create.
- If database persistence fails after provider creation, `delete_live_stream(live_id, settings)` is called as a compensating cleanup hook.
- `VDOCIPHER_LIVE_DELETE_URL` is optional. When configured, it should be a `DELETE` endpoint template containing `{live_id}` or `{liveId}`; without a placeholder, the encoded live id is appended as the final path segment.
- When no delete endpoint is configured or provider deletion fails, the backend writes a `VdoCipherLiveCleanup` admin audit record and emits `vdocipher_live_cleanup_required_after_persist_failure` for manual cleanup.

## Content Data

Current compatibility content stores VdoCipher ids on lesson/section video fields.

TopicItem-first content should model provider-backed video through `Resource` and `TabContent` so the Topic Workspace can render it without depending on the compatibility lesson route.

## Local Verification

Use a local authenticated request against a seeded lesson or section that has a real VdoCipher id:

```bash
curl http://127.0.0.1:8000/api/courses/lessons/1/stream ^
  -H "Authorization: Bearer <token>"
```
