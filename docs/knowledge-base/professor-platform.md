# Professor Platform

## Purpose

Kresco needs a secure professor-facing area for teachers to manage the course offering they teach, operate live sessions, submit content edit requests, and eventually use a professor chat assistant.

This is not the same as the power admin panel. Professors should not receive broad `is_staff` access.

## Role model

Professor is a first-class user category.

Use `User.role = "professor"` for professor accounts. Keep `is_staff` reserved for internal staff and SQLAdmin/global admin access.

## Track and offering model

Students are assigned to one `niveau + filiere` during account creation and only see the content for that track. Professor ownership must follow the same separation.

Target hierarchy:

```text
Subject
-> ProgramTrack
-> CourseOffering
-> Topic
-> TopicSection
-> TopicItem
-> TabContent / Resources / Quizzes
```

Definitions:

- `Subject`: global subject identity, such as Mathematics, Physics, Philosophy.
- `ProgramTrack`: academic track, such as `2BAC Sciences Math B` or `2BAC Sciences Physiques`.
- `CourseOffering`: one subject inside one program track, taught by one professor.
- `Topic`: belongs to one `CourseOffering`, so Math topics for Sciences Math B can differ from Math topics for Sciences Physiques.

Example:

```text
Mathematics + 2BAC Sciences Math B -> Pr Ahmed
Physics + 2BAC Sciences Physiques -> Pr Salma
```

MVP assumption: one professor per subject per track. The data model can still allow reassignment over time.

The backend should allow a professor to have multiple `CourseOffering` assignments over time, but the MVP UI should behave like a single-offering dashboard by default.

UX rule:

- If a professor has one active offering, open directly into that offering with no selector.
- If a professor has multiple active offerings, show a clear top-level offering switcher.
- Live sessions, announcements, stats, and edit requests are always tied to the currently selected `CourseOffering`.
- The active subject, niveau, and filiere must stay visible on professor screens where mistakes would matter.

This keeps the MVP simple for professors while avoiding a future data-model rewrite.

## Security rules

Professor APIs must enforce scope on the backend, not only in the frontend.

Use a separate professor authentication surface, but do not create a separate user database.

Recommended routes:

```text
/professor/login
/professor
/professor/live
/professor/changes
```

Internally, professor login should still use the shared `User` table and token/session system, with stricter role and assignment checks.

A professor can access the professor area only if:

```text
User.role = "professor"
AND the professor account is active
AND the user has an active CourseOffering assignment
```

A professor can view or act on content only if:

```text
target Topic belongs to one of the professor's CourseOfferings
```

Everything below `Topic` inherits the topic's `CourseOffering` scope.

Security baseline:

- Add a backend dependency such as `get_current_professor_user()`.
- Re-check professor role and course-offering scope on every professor endpoint.
- Keep `is_staff` and SQLAdmin inaccessible to ordinary professor accounts.
- Audit-log professor actions.
- Rate-limit professor login and sensitive actions.
- Require verified email for professor accounts.
- Consider 2FA for professor accounts after MVP.

Professor login should use Firebase Auth email/password first, with the backend issuing an app session only after verifying the Firebase ID token and an existing professor assignment. Google sign-in can be allowed only when an admin explicitly links the Google email/account to an existing professor account. Do not grant professor status from a domain match or self-service Google signup.

Professor accounts are admin-created only for MVP. There should be no public professor self-registration or "request professor access" flow. Because the expected professor count is small, manual provisioning is safer and operationally acceptable.

The frontend route guard is only for user experience. Security must live in backend dependencies and scoped queries.

## MVP permissions

Professors can:

- View their assigned course offering.
- Propose edits to existing topic titles and descriptions.
- Propose edits to existing topic item titles and descriptions.
- Propose edits to existing quiz/tab content.
- Schedule, edit, announce, start, end, and cancel live sessions directly.
- Use the future professor chat area.

Professors cannot:

- Create new topics in MVP.
- Delete topics.
- Publish or unpublish course content globally.
- Edit another professor's course offering.
- Access SQLAdmin or global admin analytics unless they are also staff.
- See student analytics or stats in MVP.

Professor statistics are out of scope for MVP. Do not show enrolled counts, progress, quiz pass rates, live attendance, or individual student performance on the first professor dashboard. Analytics can be added later after the professor permission model is stable.

## Content edit approval

Professor edits to student-facing course content must create pending admin requests. They do not go live immediately.

Needs admin approval:

- Topic title/description edits.
- Topic item title/description edits.
- Quiz/tab content edits.
- Future resource/content edits.

Quiz edits should use a structured but narrow change-request form. The professor should see the existing quiz content read-only, edit controlled proposed fields, and submit the proposal for admin review. Avoid a freeform "describe what to change" box as the only mechanism, and do not let professor quiz edits mutate live quiz data directly in MVP.

Direct professor actions:

- Scheduling live sessions.
- Editing own live sessions.
- Sending live-session notifications.
- Starting and ending live sessions.
- Chat messages.

Suggested change request model:

```text
ProfessorChangeRequest
- id
- course_offering_id
- professor_user_id
- target_type: "topic" | "topic_item" | "tab_content"
- target_id
- change_type: "update_fields" | "quiz_update"
- proposed_patch_json
- current_snapshot_json
- status: "pending" | "approved" | "rejected" | "cancelled"
- admin_user_id
- admin_note
- created_at
- reviewed_at
```

On approval, the backend applies the patch and records the audit trail.

## Announcements

Standalone professor announcements are out of scope for MVP.

For now, professor-to-student notifications should be tied to live sessions only, for example:

- Live session scheduled.
- Live session starts soon.
- Live session is live now.
- Live session cancelled or rescheduled.

Do not build a separate announcement authoring surface in the first professor dashboard. A durable `Announcement` model can be revisited later if professor communication needs expand beyond live-session notifications.

## Live sessions

Use VdoCipher for secure embedded one-to-many live video.

VdoCipher is the right core for:

- Professor-to-many-students broadcast.
- Embedded in-platform live player.
- Protected video delivery.
- DVR/recording.
- Later attaching the live recording as VOD content.

VdoCipher should not be treated as the student microphone/camera layer.

MVP live flow:

```text
Professor schedules live session
-> system creates/links VdoCipher live stream
-> professor configures OBS or broadcasting setup
-> professor announces the session
-> professor starts session
-> students watch embedded VdoCipher player inside Kresco
-> professor ends session
-> recording can later be attached back to the course/topic
```

Suggested live session data can extend or wrap `CalendarEvent`:

```text
LiveSession
- id
- course_offering_id
- calendar_event_id
- vdocipher_live_id
- stream_ingest_url
- stream_key
- provider_payload_json
- title
- description
- starts_at
- ends_at
- status: "scheduled" | "live" | "completed" | "cancelled"
- recording_resource_id
```

`CalendarEvent` already has `event_type`, `teacher_name`, `subject_id`, `topic_id`, `join_url`, and `status`; it may remain the calendar surface while `LiveSession` stores provider-specific data.

### VdoCipher live-create integration contract

Kresco supports both manual and programmatic live setup.

Manual setup:

- Create the live in VdoCipher or another operations flow.
- Paste the VdoCipher `liveId` into the professor live form.
- Optionally paste the OBS ingest URL and stream key so the professor control room and SQLAdmin can show repair/debug details.

Programmatic setup:

- Set `VDOCIPHER_API_SECRET`.
- Set `VDOCIPHER_LIVE_CREATE_URL` to the account-specific VdoCipher live-stream creation endpoint.
- Enable `Generate stream` in the professor live form.

Kresco sends:

```json
{
  "title": "Live session title",
  "chatMode": "anonymous",
  "hidePolls": true,
  "hideQnA": false,
  "disableEmojis": true
}
```

Kresco expects the provider response to include one live identifier under one of:

```text
liveId, live_id, id, streamId, stream_id
```

Kresco also stores optional ingest credentials from:

```text
streamUrl, stream_url, ingestUrl, ingest_url, rtmpUrl, rtmp_url
streamKey, stream_key, key
```

If provider creation fails, Kresco returns the provider error and does not create a broken `LiveSession`. The professor can still create the session manually by pasting the `liveId`.

Embed URLs:

```text
Player: https://player.vdocipher.com/live-v2?liveId={liveId}
Chat:   https://zenstream.chat?liveId={liveId}
```

Verification checklist before calling programmatic generation complete:

- `GET /api/professor/live-provider-config` returns `can_auto_create: true`.
- Creating a professor live session with `auto_create_vdocipher: true` stores a real `vdocipher_live_id`.
- The returned session includes usable `stream_ingest_url` and/or `stream_key` when VdoCipher returns them.
- Professor control room opens the player iframe and displays OBS credentials.
- Student room opens the VdoCipher player and ZenStream chat for the same live ID.
- Failed provider responses return `502` and leave no partial live session.

## Live chat and VIP speak requests

For MVP, students cannot appear on camera or microphone.

All students can:

- Watch the live stream.
- Use text chat/questions, depending on access policy.

VIP/Platinum students can:

- Send prioritized questions.
- Submit a request to speak.

In MVP, request-to-speak is a queue only. It does not open a microphone.

Future audio path:

- Keep VdoCipher as the main protected broadcast.
- Add a separate audio-only WebRTC provider, such as LiveKit or Daily, for approved VIP/Platinum speakers.
- Professor approves one speaker at a time.
- Approved student joins a temporary audio room.
- Professor hears or mixes that audio into the broadcast setup.

Suggested speak request model:

```text
LiveSpeakRequest
- id
- live_session_id
- student_user_id
- priority_tier: "vip" | "platinum"
- question_text
- status: "pending" | "approved" | "rejected" | "expired"
- requested_at
- decided_at
```

Prefer Kresco-owned chat for long-term control over moderation, VIP priority, AI summaries, analytics, and history. VdoCipher chat can be used only if speed is more important than platform ownership.

MVP real-time strategy can be polling. Later upgrade to WebSocket or SSE.

## Professor chat direction

Professor chat now has a first backend/frontend implementation for private professor-student conversations. Keep future expansion behind the same policy boundary instead of adding tier or track checks directly in route handlers.

The professor chat area should feel like a focused messaging inbox, closer to WhatsApp than a forum or admin table.

Expected professor chat UI:

- Conversation list ordered by most recent activity.
- Search across conversations and message text.
- Filters for unread conversations.
- Filters or section for pinned conversations.
- Clear unread counters.
- Pin/unpin conversation action.
- Read/unread state.
- Active conversation panel with message history.
- Course-offering context visible so professors do not confuse filieres.

Chat model decision: professor chat is for private professor-student conversations, not only whole-class chat.

Because this creates a private messaging surface, build guardrails into the model from the start:

- Conversations must be scoped to a `CourseOffering`.
- A professor can message only students enrolled in that offering.
- Only eligible VIP/Platinum students can start a private professor conversation.
- Eligible students can message only the professor for their active offering.
- Use one private conversation per student per `CourseOffering`.
- Private conversations are student-initiated only.
- Professors can reply to existing conversations but cannot start a new private conversation with a student.
- Messages should be retained for moderation/auditability.
- Admins should be able to inspect conversations when needed for safety/support.
- Add block/report/moderation controls later if chat becomes broadly used.
- Do not expose professor personal phone numbers or external contact details.
- Backend student-chat tier and offering-track eligibility lives in `backend/app/services/professor_chat_access.py`.

The professor dashboard exposes chat as a dedicated surface:

```text
/professor/chat
```

This chat should remain Kresco-owned so the platform can support moderation, VIP/Platinum priority, AI summaries, auditability, and long-term history.

## Firestore realtime foundation

Use Firestore as the realtime transport foundation for live-session notifications and professor chat updates. Postgres remains the durable source of truth; Firestore receives short-lived event documents from the backend realtime outbox.

Security rule: do not let the browser publish realtime business events directly. The browser listens to authorized channels, while backend services persist the durable record and enqueue the corresponding realtime event.

Backend configuration:

```text
FIREBASE_PROJECT_ID=<firebase-project-id>
FIREBASE_WEB_API_KEY=<firebase-web-api-key>
FIRESTORE_DATABASE=(default)
REALTIME_OUTBOX_SECRET=<32+ chars>
```

### Local demo seed

Use the repeatable professor demo seed when screenshots or local QA need every professor surface populated:

```bash
cd backend
set DATABASE_URL=sqlite+aiosqlite:///./professor_demo.sqlite3
set KRESCO_CONFIRM_DESTRUCTIVE_SEED=seed_professor_demo.py:sqlite+aiosqlite:///./professor_demo.sqlite3
python seed_professor_demo.py
```

Seeded database identities. Interactive login requires matching Firebase Auth users or a test-session helper:

- `professor@example.com`
- `physics.professor@example.com`
- `vip@example.com`
- `platinum@example.com`
- `basic@example.com`

The seed fills live sessions in `scheduled`, `live`, `completed`, and `cancelled` states; pending, approved, and rejected change requests; pinned and unread professor chat threads; and a locked basic-student chat state.

Realtime subscription endpoint:

```text
GET /api/realtime/subscriptions
```

The endpoint requires the normal Kresco bearer token, validates the current user, and returns the notification channels the frontend should subscribe to.

Initial channel naming:

```text
kresco:user:{user_id}:notifications
kresco:professor:{professor_user_id}:inbox
kresco:offering:{course_offering_id}:notifications
kresco:live:{live_session_id}
```

Default access should stay narrow. Persist durable chat and notification records in Kresco first, then enqueue Firestore events for fanout.

Frontend rule: use the shared realtime facade in `frontend/lib/realtime.ts`. It listens to `realtimeChannels/{encodedChannel}/events` and falls back to polling when Firebase realtime configuration is missing.

## Professor dashboard route

Use a separate secure route:

```text
/professor
```

Show a role-based navigation item only for professor users.

`/professor` should land on a professor dashboard overview, not directly on Live Sessions or Change Requests.

Initial dashboard sections:

- Active `CourseOffering` summary.
- Upcoming or live session card.
- Recent live-session notifications/status.
- Pending content change requests.
- Chat placeholder/status card.

The page should follow the existing Figma/Kresco shell rather than a generic admin dashboard.

Use the same Kresco visual language, typography, spacing, and card system, but provide professor-specific navigation. Do not blindly reuse student dashboard nav items. Professor navigation should expose professor tools only, such as dashboard, live sessions, change requests, and future chat.
