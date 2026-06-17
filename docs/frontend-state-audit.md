# Frontend Loading, Success, Failure, and Error State Audit

Audit date: 2026-06-16

Scope: `frontend/app`, `frontend/components`, `frontend/hooks`, `frontend/lib`, and existing frontend tests used as behavioral evidence.

Method: read-only audit using one local pass plus four parallel subagent scans:

- Student/dashboard routes and directly used data hooks.
- Admin, auth, payment, pricing, and professor surfaces.
- Shared data/error architecture and reusable state primitives.
- Interactive lessons, animated renderers, media players, and activity components.

No product code changes were made for this audit. This file is the deliverable for the UI implementation pass.

## Executive Summary

The frontend has a solid baseline for catastrophic route failures: several Next route segments define `loading.tsx` and `error.tsx`, `RouteErrorState` and `ErrorBoundary` exist, and shared SWR retry behavior is intentional.

The main gaps are not global crashes. They are local product states where failed API loads become "empty" or "not found", mutations only show transient toasts, or educational content falls through without a durable invalid-content state.

Highest-risk themes:

- Failed list/detail loads are often toast-only and then render empty states.
- Several mutations disable controls without clear pending copy or durable retry/error state.
- Some activity components treat missing content as a valid correct answer, or crash on empty sequences.
- Payment recovery can fail silently and expose a duplicate checkout path.
- Profile and notifications can replace real unavailable data with demo/empty UI.

## Severity Guide

- High: can mislead users, lose work, allow duplicate financial actions, mark learning progress incorrectly, or crash important learning flows.
- Medium: blocks recovery, hides partial failures, enables duplicate actions, or gives misleading stale/empty UI.
- Low: polish/accessibility/recoverability gap that still matters, but has a lower chance of data or progress loss.

## High Severity Findings

### H1. Student professor-chat first-message flow can fail silently

- Area: student professor chat.
- Files:
  - `frontend/app/(dashboard)/professor-chat/page.tsx:196`
  - `frontend/app/(dashboard)/professor-chat/page.tsx:553`
- Flow: a student starts a new professor conversation.
- Missing states: loading, failure, retry.
- Evidence: `startConversation` awaits API calls but has no `try/catch/finally` and does not set `sending`, while the submit button is disabled from `sending`.
- User impact: failed conversation creation can leave the user with no durable explanation and no visible retry state.
- UI work: add `startingConversation` state, disable the form with "Starting...", preserve the draft, show inline error copy, and provide retry.

### H2. Final exam submission failure only toasts and can re-loop

- Area: subject exam.
- File: `frontend/app/(dashboard)/exam/[subjectId]/page.tsx:112`
- Flow: student submits the final exam manually or the timer auto-submits.
- Missing states: durable submission failure, retry, pending state safety.
- Evidence: catch only calls `toast.error`, resets `submitted` and `submitCalledRef`, and the timer can call `handleSubmit()` whenever remaining time is `<= 0`.
- User impact: answers may be preserved in memory, but the student sees only a transient toast and may get repeated auto-submit attempts.
- UI work: show a persistent "Submission failed" panel preserving answers, add explicit retry, disable submit while pending, and stop repeated auto-submit after a failure.

### H3. Payment recovery errors collapse into "no existing request"

- Area: pricing and payment recovery.
- Files:
  - `frontend/lib/payments.ts:72`
  - `frontend/app/pricing/page.tsx:58`
  - `frontend/app/pricing/page.tsx:298`
  - `frontend/tests/payments.test.ts:42`
- Flow: logged-in non-Pro user opens `/pricing` with an existing pending, failed, or manual payment request.
- Missing states: initial current-payment loading, recovery failure, retry, duplicate-checkout guard.
- Evidence: `getCurrentProPaymentRequest` catches all errors and returns `null`; `/pricing` then clears pending/support state and enables new checkout as if no request exists.
- User impact: a network or backend failure can hide an existing payment and invite duplicate payment creation.
- UI work: distinguish confirmed "no request" from lookup failure, show a retryable payment-status error panel, and disable checkout until recovery succeeds or the user explicitly proceeds.

### H4. Exam Bank list/detail failures are masked as empty or not found

- Area: exam bank.
- Files:
  - `frontend/app/(dashboard)/exam-bank/page.tsx:80`
  - `frontend/app/(dashboard)/exam-bank/page.tsx:269`
  - `frontend/app/(dashboard)/exam-bank/page.tsx:409`
  - `frontend/lib/courseDiscoveryData.ts:119`
- Flow: open/search exam bank or open a problem detail.
- Missing states: list load failure, detail load failure, retry.
- Evidence: `activeError` only toasts; list can render "No exam problems match this search"; detail can render "Exam problem not found."
- User impact: users cannot tell whether content is absent, inaccessible, or temporarily unavailable.
- UI work: render separate retryable error cards for list and detail, and keep stale data visible with a warning when possible.

### H5. Exercise Bank failures are masked as empty or not found

- Area: exercise bank.
- Files:
  - `frontend/app/(dashboard)/exercise-bank/page.tsx:81`
  - `frontend/app/(dashboard)/exercise-bank/page.tsx:239`
  - `frontend/app/(dashboard)/exercise-bank/page.tsx:276`
  - `frontend/app/(dashboard)/exercise-bank/page.tsx:356`
  - `frontend/lib/exerciseBankData.ts:81`
- Flow: load subjects, load exercise list, or open exercise detail.
- Missing states: subject-list failure, list failure, detail failure, retry.
- Evidence: API errors only toast, then the UI can say "No published subjects are available yet", "No exercises match these filters", or "Exercise not found."
- User impact: backend/API failures are indistinguishable from real empty content.
- UI work: add distinct error panels for subjects, exercise list, and detail; include retry and stale data handling.

### H6. Empty activity data can be submitted as correct

- Area: interactive activities.
- Files:
  - `frontend/components/activities/InteractiveActivityRenderer.tsx:162`
  - `frontend/components/activities/Matching.tsx:47`
  - `frontend/components/activities/Ordering.tsx:18`
  - `frontend/components/activities/DragAndDrop.tsx:36`
- Flow: learner opens matching, ordering, or drag/drop activity with missing or empty `activityData`.
- Missing states: invalid-content and empty-content state.
- Evidence: renderer defaults `pairs`, `items`, `correctOrder`, and `zones` to `[]`; empty `every()` checks can pass and submit buttons can be enabled.
- User impact: incomplete authored content can be marked correct and trigger learning completion.
- UI work: validate minimum activity data before rendering, show "Activity unavailable/incomplete", and disable completion for invalid content.

### H7. Empty sequenced labs can crash instead of rendering an empty state

- Area: ondes/math lab activities.
- Files:
  - `frontend/components/activities/math/EnsemblesLab.tsx:47`
  - `frontend/components/activities/math/LimitesContinuiteLab.tsx:52`
  - `frontend/components/activities/ondes/OndeCaracteristiques.tsx:52`
  - `frontend/components/activities/ondes/OndeTrueFalse.tsx:52`
- Flow: lesson provides explicit empty `challenges`, `exercises`, `questions`, or `statements`.
- Missing states: empty sequence, invalid-content error state.
- Evidence: components immediately dereference `current.question`, `current.value`, or `qs[idx].statement`.
- User impact: malformed lesson content can crash the activity panel.
- UI work: guard empty arrays, render a recoverable empty/invalid state, and prevent completion.

### H8. Perfect final lab attempts can report incomplete completion

- Area: sequenced activity completion.
- Files:
  - `frontend/components/activities/math/EnsemblesLab.tsx:62`
  - `frontend/components/activities/math/LimitesContinuiteLab.tsx:62`
  - `frontend/components/activities/ondes/OndeCaracteristiques.tsx:63`
- Flow: learner answers the last question correctly and clicks "Voir le resultat".
- Missing states: reliable success/completion state.
- Evidence: submit increments `correctCount`/`score`; final `next()` adds the current correctness again before comparing to total length.
- User impact: a perfect run can be reported as incomplete, blocking progress/reward flows.
- UI work: compute final score once from committed answers, or pass the already-updated score into the final completion branch.

## Medium Severity Findings

### M1. Courses initial load failure renders as normal empty search

- Area: courses discovery.
- Files:
  - `frontend/app/(dashboard)/courses/page.tsx:46`
  - `frontend/app/(dashboard)/courses/page.tsx:125`
  - `frontend/lib/courseDiscoveryData.ts:106`
- Flow: open `/courses` while topics API fails.
- Missing states: inline failure and retry.
- Evidence: load error only toasts; empty `topics` falls through to "No courses found."
- UI work: add an error card with retry, or a stale-data banner when cached topics exist.

### M2. Calendar load and deep-link failures have no durable state

- Area: calendar.
- File: `frontend/app/(dashboard)/calendar/page.tsx:71`
- Flow: open calendar, switch week, or load `?event=`.
- Missing states: persistent week-load error, event-detail error, retry.
- Evidence: catches only toast; failed week load can show "No scheduled sessions this week."
- UI work: store `loadError`, preserve previous events on refresh failure, show a retry banner/card, and show an event-detail failure state for broken deep links.

### M3. Topic notes and comments convert load failures into empty tabs

- Area: topic workspace tabs.
- Files:
  - `frontend/hooks/useTopicNotes.ts:24`
  - `frontend/components/topic-workspace/TopicWorkspaceNotesTab.tsx:69`
  - `frontend/components/topic-workspace/TopicWorkspacePanels.tsx:93`
  - `frontend/components/topic-workspace/TopicWorkspacePanels.tsx:163`
- Flow: open Notes or Comments tab.
- Missing states: persistent load error, retry, stale-data preservation.
- Evidence: notes/comments catch errors, clear or leave empty arrays, toast, then render "No notes yet" or "No comments yet."
- UI work: expose `error` and `retry`, keep previous items on refresh failure, and distinguish true empty from unavailable data.

### M4. Profile can render demo/fallback data as real user state

- Area: profile.
- Files:
  - `frontend/lib/profileData.ts:52`
  - `frontend/app/(dashboard)/profile/page.tsx:118`
  - `frontend/lib/profileViewModel.ts:92`
  - `frontend/components/figma/profile.tsx:121`
  - `frontend/tests/profileViewModel.test.ts:43`
- Flow: `/profile` loads identity, XP, subjects, notes, saves, followers, and sidebar resources.
- Missing states: per-widget loading/error/empty states.
- Evidence: loading stops once any query has data or error; view-model fallbacks can substitute demo values such as `Ahmed Malik`, large XP, streak, fallback subjects, and joined date.
- User impact: unavailable real data can look like real profile data.
- UI work: reserve demo fallbacks for design/demo mode only; render explicit unavailable/empty states per widget.

### M5. Notification load/read failures are mostly invisible

- Area: top navigation notification dropdown.
- File: `frontend/components/TopNav.tsx:49`
- Flow: unread badge, dropdown open, realtime refresh, mark read, mark all read.
- Missing states: loading row, failure row, retry, stale preservation, read-mutation failure.
- Evidence: `refreshNotifications` clears notifications/unread count on error; dropdown can show "No notifications yet"; read mutations lack local catch/user feedback.
- UI work: track `notificationsLoading` and `notificationsError`, preserve last known notifications, add dropdown retry, and show failures for read mutations.

### M6. Professor change-request load failure falls through to empty or stale state

- Area: professor change requests.
- File: `frontend/app/professor/changes/page.tsx:14`
- Flow: open `/professor/changes` or switch pending/approved/rejected filters.
- Missing states: persistent first-load error, retry, stale-data warning.
- Evidence: fetch failure only calls `toast.error`; UI branches only on `loading` and `requests.length`; failed filter loads can show stale data or "No requests."
- UI work: store `error`, render retryable error panel, and either clear stale data or label it as cached while retrying.

### M7. Professor live control room aggregates unrelated resource states

- Area: professor live control room.
- Files:
  - `frontend/lib/liveSessionData.ts:121`
  - `frontend/app/professor/live/[sessionId]/page.tsx:53`
  - `frontend/app/professor/live/[sessionId]/page.tsx:217`
  - `frontend/app/professor/live/[sessionId]/page.tsx:263`
- Flow: control room metadata, player embed, questions, chat messages.
- Missing states: separate session, embed, and interaction loading/error/retry states.
- Evidence: hook returns one combined `loading` and first `error`; player can show "Opening player..." because interactions are loading, or interactions can show empty when they failed.
- UI work: expose `embedError`, `interactionsError`, and separate loading flags; let player depend on embed/session state and chat depend on interactions state.

### M8. Admin finance reconciliation/import have no submit pending state

- Area: admin finance.
- File: `frontend/app/admin/finance/page.tsx:147`
- Flow: staff submits Single reconciliation or Normalized import.
- Missing states: per-form pending, disabled submit, persistent success/error summary.
- Evidence: `submitReconciliation` and `submitImport` await mutations, but only review actions use `busyId`; the form buttons are always enabled.
- UI work: add `reconciling` and `importing`, disable inputs/buttons while pending, show "Reconciling..." and "Importing...", and render inline result/error summaries.

### M9. Professor dashboard quick actions can be double-submitted

- Area: professor dashboard.
- File: `frontend/app/professor/page.tsx:122`
- Flow: professor clicks "Notify students" or "Start live" from dashboard.
- Missing states: action-level pending state.
- Evidence: async button handlers run API calls, but disabled conditions only check `!live`, `loading`, or live status.
- UI work: add `dashboardAction` state, disable both live action buttons during mutation, and show "Notifying..." or "Starting..." labels.

### M10. Dynamic activity and simulator chunks have no loading or failure UI

- Area: interactive activity renderer.
- File: `frontend/components/activities/InteractiveActivityRenderer.tsx:12`
- Flow: learner opens ondes/math/simulator activity while client chunk loads or fails.
- Missing states: dynamic import loading and failure state.
- Evidence: several `dynamic(..., { ssr: false })` components are declared without `loading`, and math/ondes cases return components outside `ActivityErrorBoundary`.
- UI work: add loading placeholders and wrap these branches in the same error boundary pattern as lazy activities.

### M11. Animated source renderers silently default on invalid metadata

- Area: animated lesson renderer selection.
- Files:
  - `frontend/components/animated/renderers/WaveSourceRenderer.tsx:93`
  - `frontend/components/animated/renderers/OpticsSourceRenderer.tsx:69`
  - `frontend/components/animated/renderers/NuclearSourceRenderer.tsx:149`
  - `frontend/components/animated/renderers/ChemistrySourceRenderer.tsx:78`
  - `frontend/components/animated/renderers/MathSourceRenderer.tsx:60`
- Flow: authored config has missing or mistyped `metadata.component`.
- Missing states: invalid renderer/config state.
- Evidence: unknown keys default to unrelated components such as wave simulator, diffraction simulator, atom composition, kinetics course, or sets inclusion.
- User impact: students can see the wrong content without any warning.
- UI work: show a visible "Unknown animated component" state with the received key and do not render unrelated fallback content.

### M12. Animated registry lacks per-renderer error boundaries

- Area: animated renderer registry and showcase.
- Files:
  - `frontend/components/animated/registry.tsx:58`
  - `frontend/components/animated/registry.tsx:237`
  - `frontend/components/animated/AnimatedShowcaseSimpleClient.tsx:117`
- Flow: renderer import or child component throws.
- Missing states: per-card renderer failure and reset/retry.
- Evidence: registry supplies loading fallbacks, but `AnimatedContentRenderer` returns `<Renderer {...props} />` without a boundary.
- UI work: add an animated renderer boundary with renderer key, failure copy, and retry/reset.

### M13. Calculation exercises lack invalid-input states

- Area: animated calculation exercises.
- Files:
  - `frontend/components/animated/source-ports/chemistry/components/interactive/ChimieExercises.tsx:18`
  - `frontend/components/animated/source-ports/rc/RCExercises.tsx:61`
  - `frontend/components/animated/source-ports/nuclear/components/interactive/NuclearExercises.tsx:22`
  - `frontend/components/animated/source-ports/nuclear/components/interactive/RadioactivityExercises.tsx:18`
  - `frontend/components/animated/source-ports/nuclear/components/interactive/NuclearAdvancedExercises.tsx:52`
  - `frontend/components/animated/source-ports/nuclear/components/interactive/ComprehensiveExercises.tsx:140`
  - `frontend/components/animated/source-ports/waves/course/components/interactive/advanced/WaveAdvancedExercises.tsx:115`
  - `frontend/components/animated/source-ports/optics/course/components/interactive/advanced/LightAdvancedExercises.tsx:82`
  - `frontend/components/animated/source-ports/waves/course/components/interactive/WaveExercises.tsx:227`
- Flow: learner submits empty, non-numeric, or malformed numeric input.
- Missing states: invalid-input validation distinct from incorrect answer.
- Evidence: handlers parse with `parseFloat`/`parseInt` and immediately mark incorrect, or silently return on `isNaN`.
- UI work: disable submit until parsable, add inline validation, set `aria-invalid`, and reserve "incorrect" for valid attempted answers.

### M14. Vdo player can spin forever on empty stream data

- Area: VdoCipher lesson player.
- File: `frontend/components/VideoPlayer.tsx:176`
- Flow: stream API succeeds but returns `null` or missing `otp`/`playback_info`.
- Missing states: empty/unconfigured media state.
- Evidence: after loading finishes, `!streamData` still renders "Chargement de la video..."; missing credentials can be encoded as empty strings into iframe URL.
- UI work: validate stream payload after fetch and render "video not configured/unavailable" with retry/support copy.

### M15. YouTube and generic video completion save failures can be silent

- Area: video progress/completion.
- Files:
  - `frontend/components/YouTubeVideoPlayer.tsx:149`
  - `frontend/hooks/useVideoProgress.ts:61`
  - `frontend/hooks/useVideoProgress.ts:93`
- Flow: video reaches completion but `/complete` POST fails.
- Missing states: completion-save failed, retry, pending sync.
- Evidence: `postWatchedSeconds` catches and returns false; non-awaited completion calls can still run `onComplete`.
- User impact: UI can appear completed while backend progress/rewards were not saved.
- UI work: expose `syncStatus`/`lastSyncError`, show failed-save state near progress, and use awaited completion for reward/unlock flows.

### M16. Live room embed errors lose the real reason after toast

- Area: student live room.
- File: `frontend/app/(dashboard)/live/[sessionId]/page.tsx:63`
- Flow: student joins live session while embed credentials fail.
- Missing states: inline embed error and retry.
- Evidence: `embedError` only toasts; player panel can show generic "not joinable yet, or credentials are not ready."
- UI work: render `apiDataErrorMessage(embedError, ...)` inside the player panel with retry.

## Low Severity Findings

### L1. Guest auth guard renders blank while hydrating or redirecting

- Area: public auth/professor login guard.
- File: `frontend/components/GuestGuard.tsx:51`
- Flow: user opens `/` or `/professor/login`.
- Missing states: loading/redirecting state.
- Evidence: guard returns `null` while hydrating and while redirecting authenticated users.
- UI work: render a minimal full-page auth loading state.

### L2. Google auth SDK load failure has no user-visible state

- Area: auth page.
- Files:
  - `frontend/lib/authPageController.ts:159`
  - `frontend/components/auth/AuthPageView.tsx:180`
- Flow: user tries Google sign-in while GSI is blocked, fails to load, or client ID is misconfigured.
- Missing states: SDK load failure, retry/fallback copy.
- Evidence: script only handles `onload`; Google button is disabled when `!googleReady`.
- UI work: add `googleLoadError`, timeout/onerror handling, retry or hide the Google button, and show short fallback copy.

### L3. Professor chat pin/unpin lacks pending state

- Area: professor chat.
- File: `frontend/app/professor/chat/page.tsx:211`
- Flow: professor pins or unpins an active conversation.
- Missing states: per-conversation pending.
- Evidence: `togglePin` awaits `patchProfessorConversation`, but the pin button is never disabled or marked busy.
- UI work: add `pinBusyId`, disable the pin button while saving, and show a spinner or optimistic pressed state.

### L4. Local editor clipboard/storage actions assume browser APIs succeed

- Area: admin course editor and activities helper.
- Files:
  - `frontend/app/admin/courses/content/page.tsx:115`
  - `frontend/app/admin/courses/activities/page.tsx:123`
- Flow: admin saves a local draft or copies generated/course JSON.
- Missing states: failure handling for `localStorage` and Clipboard API.
- Evidence: local draft write and copy success toast run without guarded failure; activity copy writes to clipboard and immediately shows success.
- UI work: wrap browser API calls in `try/catch`, await clipboard writes, disable while copying, and show failure toast/copy when permission/quota/security errors occur.

### L5. Logout and toaster failure signals are not surfaced

- Area: shared app shell.
- Files:
  - `frontend/lib/store.ts:85`
  - `frontend/components/TopNav.tsx:67`
  - `frontend/components/AppToaster.tsx:21`
- Flow: logout request fails, or lazy toaster import fails while flows rely on toast-only errors.
- Missing states: logout failure UI and toast fallback.
- Evidence: store preserves `logoutError`, but TopNav ignores a false logout result; `AppToaster` lazy-loads `sonner` without visible fallback.
- UI work: show logout failure in the account/menu surface and add a minimal fallback or telemetry path if the toaster cannot load.

## Areas Checked With Adequate State Coverage

These areas were checked and did not produce actionable missing-state findings in this audit:

- Global and dashboard route `loading.tsx` / `error.tsx` coverage.
- `AuthGuard`, `ErrorBoundary`, `RouteErrorState`, and `ClientErrorReporter` baseline crash/error reporting.
- Auth login, signup, forgot password, resend verification, and onboarding form loading/toast states.
- Reset password and verify-email loading/success/error screens.
- CMI payment ok/fail return screens.
- Pricing checkout creation support panel, pending manual instructions, proof submit loading, and proof-submitted state.
- Admin layout/error boundary, admin overview fallback/forbidden states, admin courses list, subject detail lazy topic load, and new-course creation states.
- Admin finance payment list load/error/empty state, audit trail load/error/empty state, and approve/reject busy/toast handling.
- Professor login loading/error state.
- Professor dashboard initial load/cached-error retry state.
- Professor live sessions list create/update/action/reveal/load/error/empty states, except the quick-action and control-room gaps listed above.
- Professor chat inbox/message load/error/retry states and send/edit/delete/image-validation flows, except first-message and pin/unpin gaps listed above.
- Home dashboard error banner and retry.
- Topic workspace top-level load/retry.
- Profile save/upload/edit states, aside from partial resource/demo fallback gaps.
- Core `TrueFalse` and `FillInBlank` activity success/failure states when valid data is present.
- YouTube and Vdo player API/player loading/error UI, aside from empty-stream and completion-sync gaps.
- KaTeX render failure display in `Latex.tsx`.

## Suggested Implementation Order

1. Fix payment recovery state and duplicate-checkout prevention.
2. Fix exam submission failure/retry and auto-submit loop behavior.
3. Add explicit error/retry states to Exam Bank, Exercise Bank, Courses, Calendar, Professor Changes, Notes/Comments, and Notifications.
4. Fix activity invalid-content handling and completion correctness.
5. Add mutation pending/error states for professor chat start, admin finance forms, professor dashboard actions, and pin/unpin.
6. Fix media/progress edge cases for Vdo empty stream and YouTube/video completion sync.
7. Replace profile demo fallback behavior with real unavailable/empty states.
