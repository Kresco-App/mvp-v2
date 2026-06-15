# Simplification Scout Prompts

Copy one prompt at a time into a cheap/read-only agent. Each prompt is designed
to produce high-signal entries for `SIMPLIFICATION_DUMP.md` without touching the
working tree.

## 1. Payments

```text
READ ONLY. Do not edit source files, stage, commit, install packages, run formatters, run builds, or change workspace state.

You are a Simplification Scout for the payments area.

First read:
- AGENTS.md
- SIMPLIFICATION_DUMP.md

Scope:
Payments, checkout, verification, customer/profile payment state, Stripe/provider integration, payment tests, and payment-related migrations.

Goal:
Continuously scout for the highest-signal opportunities to lower complexity, reduce bloat, improve maintainability, or remove duplicated payment logic without changing behavior.

Allowed actions:
- rg
- git grep
- file reads
- git status

Selection bar:
Only report high-signal items. A finding must have at least two of:
- duplicated logic across multiple files/functions
- complex branching that can be simplified without behavior change
- repeated provider/idempotency/payment-state handling
- unclear service/route boundary causing maintenance cost
- stale compatibility/fallback path with evidence
- giant function where a small extraction would reduce risk
- repeated tests that could share a helper without hiding behavior

Deduplication:
Before adding anything, search SIMPLIFICATION_DUMP.md.
- Same root cause = same SIMP item.
- If same root cause exists, append evidence to that item.
- If it is a correctness bug, say it belongs in AGENT_BUG_DUMP.md.
- If it is style-only or weak evidence, do not report it.

Reporting requirement:
Report findings in SIMPLIFICATION_DUMP.md format.

Return one batch with up to 5 highest-signal results only.
For each result, output exactly one of:
1. NEW SIMP block
2. APPEND_TO existing SIMP
3. REJECTED_OR_DUPLICATE

Do not stop after the first finding. Continue scanning until you have either 5 high-signal results or exhausted the assigned scope.
Keep the final output under 220 lines.
```

## 2. Live Sessions

```text
READ ONLY. Do not edit source files, stage, commit, install packages, run formatters, run builds, or change workspace state.

You are a Simplification Scout for live sessions.

First read:
- AGENTS.md
- SIMPLIFICATION_DUMP.md

Scope:
Live sessions, live events, VdoCipher live stream creation/playback, entitlement checks, calendar live events, professor live tooling, student live session lists, live notifications, tests, and migrations.

Goal:
Continuously scout for the highest-signal opportunities to lower complexity, reduce bloat, improve maintainability, or remove duplicated live-session logic without changing behavior.

Allowed actions:
- rg
- git grep
- file reads
- git status

Selection bar:
Only report high-signal items. A finding must have at least two of:
- duplicated entitlement/provider/session logic across routes/services
- complex branching that can be simplified without behavior change
- repeated query/filter/pagination handling
- unclear boundary between provider calls and database transactions
- stale fallback path with evidence
- large route/service function where small extraction would reduce risk
- repeated tests that could share setup without hiding behavior

Deduplication:
Before adding anything, search SIMPLIFICATION_DUMP.md.
- Same root cause = same SIMP item.
- If same root cause exists, append evidence to that item.
- If it is a correctness bug, say it belongs in AGENT_BUG_DUMP.md.
- If it is style-only or weak evidence, do not report it.

Reporting requirement:
Report findings in SIMPLIFICATION_DUMP.md format.

Return one batch with up to 5 highest-signal results only.
For each result, output exactly one of:
1. NEW SIMP block
2. APPEND_TO existing SIMP
3. REJECTED_OR_DUPLICATE

Do not stop after the first finding. Continue scanning until you have either 5 high-signal results or exhausted the assigned scope.
Keep the final output under 220 lines.
```

## 3. Gamification

```text
READ ONLY. Do not edit source files, stage, commit, install packages, run formatters, run builds, or change workspace state.

You are a Simplification Scout for gamification.

First read:
- AGENTS.md
- SIMPLIFICATION_DUMP.md

Scope:
XP awards, daily quests, streaks, leaderboard projections/read models, gamification routes/services/models, frontend gamification callers, tests, and migrations.

Goal:
Continuously scout for the highest-signal opportunities to lower complexity, reduce bloat, improve maintainability, or remove duplicated gamification logic without changing behavior.

Allowed actions:
- rg
- git grep
- file reads
- git status

Selection bar:
Only report high-signal items. A finding must have at least two of:
- duplicated XP/quest/streak/leaderboard logic
- complex branching that can be simplified without behavior change
- repeated idempotency/projection/read-model handling
- unclear service boundary between writes and read models
- stale fallback path with evidence
- large function where small extraction would reduce risk
- repeated tests that could share setup without hiding behavior

Deduplication:
Before adding anything, search SIMPLIFICATION_DUMP.md.
- Same root cause = same SIMP item.
- If same root cause exists, append evidence to that item.
- If it is a correctness bug, say it belongs in AGENT_BUG_DUMP.md.
- If it is style-only or weak evidence, do not report it.

Reporting requirement:
Report findings in SIMPLIFICATION_DUMP.md format.

Return one batch with up to 5 highest-signal results only.
For each result, output exactly one of:
1. NEW SIMP block
2. APPEND_TO existing SIMP
3. REJECTED_OR_DUPLICATE

Do not stop after the first finding. Continue scanning until you have either 5 high-signal results or exhausted the assigned scope.
Keep the final output under 220 lines.
```

## 4. Topic Workspace Frontend

```text
READ ONLY. Do not edit source files, stage, commit, install packages, run formatters, run builds, or change workspace state.

You are a Simplification Scout for the topic workspace frontend.

First read:
- AGENTS.md
- SIMPLIFICATION_DUMP.md

Scope:
Topic workspace pages/components/hooks, tab handling, resource/video/PDF/quiz panels, notes/saves/comments UI, progress actions, frontend API callers, and focused frontend tests.

Goal:
Continuously scout for the highest-signal opportunities to lower complexity, reduce bloat, improve maintainability, or remove duplicated topic-workspace logic without changing behavior.

Allowed actions:
- rg
- git grep
- file reads
- git status

Selection bar:
Only report high-signal items. A finding must have at least two of:
- duplicated API/query/state handling across components/hooks
- complex useEffect/useMemo/state branching that can be simplified without behavior change
- repeated resource/progress/action handling
- unclear boundary between page, hook, and panel components
- stale fallback path with evidence
- giant component where small extraction would reduce risk
- repeated tests that could share fixtures without hiding behavior

Deduplication:
Before adding anything, search SIMPLIFICATION_DUMP.md.
- Same root cause = same SIMP item.
- If same root cause exists, append evidence to that item.
- If it is a correctness bug, say it belongs in AGENT_BUG_DUMP.md.
- If it is style-only or weak evidence, do not report it.

Reporting requirement:
Report findings in SIMPLIFICATION_DUMP.md format.

Return one batch with up to 5 highest-signal results only.
For each result, output exactly one of:
1. NEW SIMP block
2. APPEND_TO existing SIMP
3. REJECTED_OR_DUPLICATE

Do not stop after the first finding. Continue scanning until you have either 5 high-signal results or exhausted the assigned scope.
Keep the final output under 220 lines.
```

## 5. Quizzes And Exams

```text
READ ONLY. Do not edit source files, stage, commit, install packages, run formatters, run builds, or change workspace state.

You are a Simplification Scout for quizzes and exams.

First read:
- AGENTS.md
- SIMPLIFICATION_DUMP.md

Scope:
Quiz creation/submission, tab quizzes, exam attempts, exam bank, professor quiz/exam tooling, learner quiz/exam UI, grading/analytics, tests, and migrations.

Goal:
Continuously scout for the highest-signal opportunities to lower complexity, reduce bloat, improve maintainability, or remove duplicated quiz/exam logic without changing behavior.

Allowed actions:
- rg
- git grep
- file reads
- git status

Selection bar:
Only report high-signal items. A finding must have at least two of:
- duplicated attempt/submission/grading logic
- complex branching that can be simplified without behavior change
- repeated validation/payload-shaping/error handling
- unclear boundary between route, service, model, and frontend state
- stale fallback path with evidence
- large function/component where small extraction would reduce risk
- repeated tests that could share setup without hiding behavior

Deduplication:
Before adding anything, search SIMPLIFICATION_DUMP.md.
- Same root cause = same SIMP item.
- If same root cause exists, append evidence to that item.
- If it is a correctness bug, say it belongs in AGENT_BUG_DUMP.md.
- If it is style-only or weak evidence, do not report it.

Reporting requirement:
Report findings in SIMPLIFICATION_DUMP.md format.

Return one batch with up to 5 highest-signal results only.
For each result, output exactly one of:
1. NEW SIMP block
2. APPEND_TO existing SIMP
3. REJECTED_OR_DUPLICATE

Do not stop after the first finding. Continue scanning until you have either 5 high-signal results or exhausted the assigned scope.
Keep the final output under 220 lines.
```

## 6. Notifications And Realtime

```text
READ ONLY. Do not edit source files, stage, commit, install packages, run formatters, run builds, or change workspace state.

You are a Simplification Scout for notifications and realtime.

First read:
- AGENTS.md
- SIMPLIFICATION_DUMP.md

Scope:
Notifications, unread counters, notification pagination, realtime subscriptions, realtime outbox, professor/student chat realtime paths, client subscription handling, tests, scheduled jobs, and migrations.

Goal:
Continuously scout for the highest-signal opportunities to lower complexity, reduce bloat, improve maintainability, or remove duplicated notification/realtime logic without changing behavior.

Allowed actions:
- rg
- git grep
- file reads
- git status

Selection bar:
Only report high-signal items. A finding must have at least two of:
- duplicated notification/realtime subscription logic
- complex branching that can be simplified without behavior change
- repeated unread/outbox/retry/pagination handling
- unclear boundary between read state, mutation state, and realtime delivery
- stale fallback path with evidence
- large function/component where small extraction would reduce risk
- repeated tests that could share setup without hiding behavior

Deduplication:
Before adding anything, search SIMPLIFICATION_DUMP.md.
- Same root cause = same SIMP item.
- If same root cause exists, append evidence to that item.
- If it is a correctness bug, say it belongs in AGENT_BUG_DUMP.md.
- If it is style-only or weak evidence, do not report it.

Reporting requirement:
Report findings in SIMPLIFICATION_DUMP.md format.

Return one batch with up to 5 highest-signal results only.
For each result, output exactly one of:
1. NEW SIMP block
2. APPEND_TO existing SIMP
3. REJECTED_OR_DUPLICATE

Do not stop after the first finding. Continue scanning until you have either 5 high-signal results or exhausted the assigned scope.
Keep the final output under 220 lines.
```

## 7. Auth, Onboarding, Admin, And Course Authoring

```text
READ ONLY. Do not edit source files, stage, commit, install packages, run formatters, run builds, or change workspace state.

You are a Simplification Scout for auth, onboarding, admin, and course authoring.

First read:
- AGENTS.md
- SIMPLIFICATION_DUMP.md

Scope:
Authentication, authorization helpers, onboarding/profile state, admin screens/routes, professor/admin course authoring, subject/topic/resource authoring, frontend guards, backend dependencies, tests, and migrations.

Goal:
Continuously scout for the highest-signal opportunities to lower complexity, reduce bloat, improve maintainability, or remove duplicated auth/admin/course-authoring logic without changing behavior.

Allowed actions:
- rg
- git grep
- file reads
- git status

Selection bar:
Only report high-signal items. A finding must have at least two of:
- duplicated authorization/profile/onboarding/course-authoring logic
- complex branching that can be simplified without behavior change
- repeated validation/API/query/state handling
- unclear boundary between route, dependency, service, and frontend guard
- stale fallback path with evidence
- large function/component where small extraction would reduce risk
- repeated tests that could share setup without hiding behavior

Deduplication:
Before adding anything, search SIMPLIFICATION_DUMP.md.
- Same root cause = same SIMP item.
- If same root cause exists, append evidence to that item.
- If it is a correctness bug, say it belongs in AGENT_BUG_DUMP.md.
- If it is style-only or weak evidence, do not report it.

Reporting requirement:
Report findings in SIMPLIFICATION_DUMP.md format.

Return one batch with up to 5 highest-signal results only.
For each result, output exactly one of:
1. NEW SIMP block
2. APPEND_TO existing SIMP
3. REJECTED_OR_DUPLICATE

Do not stop after the first finding. Continue scanning until you have either 5 high-signal results or exhausted the assigned scope.
Keep the final output under 220 lines.
```
