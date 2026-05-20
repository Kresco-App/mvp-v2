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
```

Do not expose this value to the frontend.

## Current Service Contract

`get_video_otp(vdocipher_id, settings)`:

- Rejects missing video ids with `404`.
- Calls `https://dev.vdocipher.com/api/videos/{id}/otp`.
- Uses `ttl=300`.
- Returns:

```json
{
  "otp": "...",
  "playback_info": "..."
}
```

## Content Data

Current compatibility content stores VdoCipher ids on lesson/section video fields.

TopicItem-first content should model provider-backed video through `Resource` and `TabContent` so the Topic Workspace can render it without depending on the compatibility lesson route.

## Local Verification

Use a local authenticated request against a seeded lesson or section that has a real VdoCipher id:

```bash
curl http://127.0.0.1:8000/api/courses/lessons/1/stream ^
  -H "Authorization: Bearer <token>"
```
