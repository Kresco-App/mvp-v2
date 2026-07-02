# Firestore Realtime Authorization Follow-up

## Summary

- `git status --short` was run first. Current WIP is `frontend/app/page.tsx`, untracked `frontend/components/landing/`, and untracked `docs/audits/`; no source finding below touches the modified/untracked app WIP paths, so no finding is `[WIP-PROVISIONAL]`.
- Backend Firestore events are written to `realtimeChannels/{url-encoded-channel}/events/{auto-id}`. The event document fields are exactly `channel`, `name`, `data`, and `createdAt`.
- Backend outbox rows store `channel`, `event_name`, and `payload_json`; outbox processing publishes those values to Firestore through `publish_firestore_message`.
- Current channel families are `kresco:user:{id}:notifications`, `kresco:professor:{id}:inbox`, `kresco:offering:{id}:notifications`, and `kresco:live:{id}`. `kresco:user:{id}:presence` is defined but no audited producer/subscriber used it.
- Frontend production Firestore access is centralized in `frontend/lib/realtime.ts`; audited production code uses `collection(...)` and `onSnapshot(...)` for direct reads. Targeted search found no production client Firestore write API usage.
- The repo contains `.firebaserc` and `firebase.json`, but no checked-in `firestore.rules` or `firestore.indexes.json`.

## Findings - severity, exact file:line, quoted evidence, concrete fix

### HIGH - The shared live-session Firestore channel cannot preserve student-level interaction visibility.

Evidence:

- `backend/app/services/professor_live_interactions.py:116`: `LiveSessionInteraction.status.not_in(["deleted", "hidden"]),`
- `backend/app/services/professor_live_interactions.py:118`: `LiveSessionInteraction.kind == "message",`
- `backend/app/services/professor_live_interactions.py:119`: `LiveSessionInteraction.student_user_id == user.id,`
- `backend/app/services/professor_live_interactions.py:120`: `LiveSessionInteraction.status == "answered",`
- `backend/app/services/professor_live_interactions.py:288`: `payload = live_interaction_out(interaction).model_dump(mode="json")`
- `backend/app/services/professor_live_interactions.py:289`: `await enqueue_live_session_event(db, interaction.live_session_id, "live.interaction.created", payload)`
- `backend/app/services/professor_serializers.py:101`: `student_user_id=interaction.student_user_id,`
- `backend/app/services/professor_serializers.py:102`: `student_name=interaction.student.full_name if interaction.student else "",`
- `backend/app/services/professor_serializers.py:104`: `body=interaction.body,`
- `frontend/lib/liveSessionData.ts:267`: `if (message.name?.startsWith('live.interaction.') && isLiveInteraction(message.data)) {`
- `frontend/lib/liveSessionData.ts:270`: `(current) => updateLiveInteractionsEnvelope(current, sessionId, (items) => mergeLiveInteraction(items, interaction)),`
- `frontend/lib/realtime.ts:247`: `firestoreSdk.collection(firestore, 'realtimeChannels', firestoreChannelDocumentId(channelName), 'events'),`
- `frontend/lib/realtime.ts:248`: `firestoreSdk.orderBy('createdAt'),`

Why this matters: the HTTP student interaction query only exposes class messages, the student's own interaction, or answered questions, while the Firestore channel publishes every created live interaction to the same `kresco:live:{sessionId}` stream. A Firestore rule that allows all authorized session participants to read that channel exposes other students' unanswered question bodies and names; a per-event deny rule would not work with the current unfiltered `orderBy/limit` listener.

Concrete fix: split the live realtime contract before granting student Firestore read access. Keep one all-participant channel, for example `kresco:live:{sessionId}:public`, for `live.session.*`, checkpoint events, class chat messages, and questions only after they become visible to all. Add a professor/staff channel, for example `kresco:live:{sessionId}:moderation`, for all question lifecycle events. Add per-student channels, for example `kresco:live:{sessionId}:user:{studentUserId}`, for that student's own question lifecycle. Update publishers, subscribers, and tests so a student Firestore listener cannot receive an event that `list_student_live_interaction_entries` would hide.

### HIGH - Firestore realtime rules and deploy ownership are missing from the repo while clients read Firestore directly.

Evidence:

- `firebase.json:2`: `"hosting": [`
- `firebase.json:104`: `}`
- `.firebaserc:3`: `"staging": "kresco-staging",`
- `.firebaserc:4`: `"production": "kresco-prod"`
- `frontend/lib/realtime.ts:247`: `firestoreSdk.collection(firestore, 'realtimeChannels', firestoreChannelDocumentId(channelName), 'events'),`
- `frontend/lib/realtime.ts:251`: `unsubscribe = firestoreSdk.onSnapshot(`
- `backend/app/services/firestore_realtime.py:50`: `channel_id = firestore_channel_document_id(channel)`
- `backend/app/services/firestore_realtime.py:52`: `client.collection("realtimeChannels")`
- `backend/app/services/firestore_realtime.py:54`: `.collection("events")`
- `backend/app/services/firestore_realtime.py:57`: `event_ref.set({`
- `backend/app/services/firestore_realtime.py:58`: `"channel": channel,`
- `backend/app/services/firestore_realtime.py:59`: `"name": name,`
- `backend/app/services/firestore_realtime.py:60`: `"data": data,`
- `backend/app/services/firestore_realtime.py:61`: `"createdAt": datetime.now(timezone.utc),`

Concrete fix: add a checked-in `firestore.rules` and a `firebase.json` Firestore deploy block. Default-deny the database, deny all client writes under `realtimeChannels`, and allow reads of `realtimeChannels/{channelId}/events/{eventId}` only through a rules-readable membership document for that exact encoded channel. Add Firebase emulator tests for anonymous denial, cross-user denial, expired membership denial, authorized read success, and denied client create/update/delete.

Recommended base rules shape:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function memberPath(channelId) {
      return /databases/$(database)/documents/realtimeChannels/$(channelId)/members/$(request.auth.uid);
    }
    function hasRealtimeRead(channelId) {
      return request.auth != null
        && exists(memberPath(channelId))
        && get(memberPath(channelId)).data.canRead == true
        && (!('expiresAt' in get(memberPath(channelId)).data)
          || get(memberPath(channelId)).data.expiresAt > request.time);
    }

    match /realtimeChannels/{channelId} {
      allow read, write: if false;

      match /members/{firebaseUid} {
        allow read, write: if false;
      }

      match /events/{eventId} {
        allow get, list: if hasRealtimeRead(channelId);
        allow create, update, delete: if false;
      }
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### HIGH - No rules-readable realtime membership projection exists for the dynamic channel families.

Evidence:

- `backend/app/models/users.py:39`: `firebase_uid: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)`
- `backend/app/services/auth.py:155`: `firebase_uid = _firebase_string_claim(payload, "uid", "user_id", "sub")`
- `backend/app/services/auth_firebase.py:144`: `user.firebase_uid = firebase_uid`
- `backend/app/services/realtime_access.py:120`: `channels = [user_notifications_channel_name(user.id)]`
- `backend/app/services/realtime_access.py:121`: `channels.extend(offering_notifications_channel_name(offering_id) for offering_id in offering_ids)`
- `backend/app/services/realtime_access.py:122`: `return RealtimeSubscriptionsOut(notification_channels=channels)`
- `frontend/hooks/useNotificationChannelsSubscription.ts:51`: `const subscriptions = await listKrescoRealtimeSubscriptions()`
- `frontend/hooks/useNotificationChannelsSubscription.ts:58`: `cleanup = subscribeKrescoRealtimeChannels({`
- `frontend/lib/liveSessionData.ts:280`: `channelName: liveSessionChannelName(sessionId),`
- `frontend/lib/realtime.ts:339`: `export async function refreshKrescoRealtimeAuthorization() {}`

Concrete fix: have the backend maintain Firestore ACL documents, written by server credentials, whenever Firebase UID, user status, entitlements, offering membership, professor assignment, or live-session access changes. Use the encoded channel ID produced by the existing helpers as the document ID.

Recommended membership document contract:

```text
realtimeChannels/{channelId}
  channel: raw channel string
  kind: user_notifications | professor_inbox | offering_notifications | live_public | live_moderation | live_user
  refId: string
  updatedAt: server timestamp

realtimeChannels/{channelId}/members/{firebaseUid}
  firebaseUid: string
  krescoUserId: number
  role: student | professor | staff | admin
  canRead: true
  expiresAt: timestamp | absent
  reason: user_self | professor_owner | offering_member | live_participant | live_moderator
  updatedAt: server timestamp
```

Populate memberships as follows:

- `kresco:user:{userId}:notifications`: only that user's `firebase_uid` while the user is active.
- `kresco:professor:{professorUserId}:inbox`: only that professor's `firebase_uid` while the professor is active and verified.
- `kresco:offering:{offeringId}:notifications`: professor owner plus students who pass the same offering access logic as `offering_ids_for_user`.
- Live public/user/moderation channels after the split above: participants who pass `require_student_live_session` get public and their own user channel; the professor owner and staff moderators get moderation.
- `kresco:user:{id}:presence`: deny until a producer/subscriber and explicit membership semantics are added.

Do not rely on `/realtime/subscriptions` as the security boundary. That endpoint can remain a discovery convenience, but Firestore rules only evaluate Firebase Auth and Firestore documents, not the prior backend API response or the Kresco JWT.

## Leads - precise remaining external-state questions or `None`

1. Verify the active deployed Firestore Security Rules and Firestore database IDs for `kresco-staging` and `kresco-prod`; the repo does not contain the deployed rules, so current live exploitability versus broken realtime is external state.
2. Confirm whether native mobile will subscribe directly to Firestore or use backend polling. Direct mobile subscriptions require the same Firebase Auth session plus membership documents; backend polling should not grant mobile clients Firestore read access.
