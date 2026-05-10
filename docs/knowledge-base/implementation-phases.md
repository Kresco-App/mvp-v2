# Implementation Phases

## Phase 1: Content model foundation

Goal: make the backend model match the product semantics.

Build:

- Subject.
- Topic.
- Section.
- TopicItem.
- Resource.
- TabContent.
- ConceptTag.
- AccessPolicy fields.
- Seed pipeline.

This phase should make old chapter/lesson assumptions optional or transitional.

## Phase 2: Seed starter Bac content

Goal: enough Physics/Math data to build and test the real UX.

Seed:

- Subjects.
- Topics.
- Lesson videos with placeholder VdoCipher IDs if needed.
- Exercise videos.
- Bac Examples.
- Quizzes with multiple question types.
- Summaries/PDF resources.
- Interactive registry references.
- Concept tags.

Keep content editable/reorderable later.

## Phase 3: Topic Workspace API

Goal: one API response can hydrate the learning room.

Endpoints should support:

- Topic overview.
- Main Path sections.
- TopicItem detail.
- Tabs for current item.
- Study Tools aggregations.
- Topic-scoped search.
- Locked preview state.
- Resume state.
- Progress summary.

## Phase 4: Topic Workspace UI

Goal: implement the main learning experience using Figma visual language.

Build:

- Header/breadcrumb/topic progress.
- Primary viewer.
- Configurable tabs below viewer.
- Right control room.
- Main Path and Study Tools switch.
- Topic search/filter.
- Locked/free preview.
- Resume behavior.

Use Figma as the visual source of truth.

## Phase 5: Quiz engine and attempts

Goal: quizzes are first-class learning objects, not only small widgets.

Build:

- Multiple question types.
- Attempt submission.
- First/latest/best attempt.
- Scoring.
- Completion.
- Retry Recommended filter.
- Topic Tools -> Quizzes.
- XP/progress events.

## Phase 6: Progress, XP, and events

Goal: track real study behavior without farming.

Build:

- Activity event ingestion.
- XP ledger.
- Progress aggregates.
- Anti-farming checks.
- Optimistic UI with server truth.
- Seasonal leaderboard foundation.

Prefer async workers for processing.

## Phase 7: Notes, saves, and profile hub

Goal: every important content object can be saved or annotated.

Build:

- Notes tab always available.
- Topic Notes tool.
- Profile Notes page.
- Saved items.
- Profile Saved hub.
- Deep links back into Topic Workspace.

## Phase 8: Exam Bank

Goal: separate Bac exam workspace.

Build:

- Exam.
- ExamProblem.
- WrittenSolution.
- VideoSolution attachment.
- Topic links.
- Filters/search.
- Topic-relevant Bac Examples integration.

## Phase 9: Admin and content operations

Goal: make seeded content manageable.

Build admin tools for:

- Reordering.
- Publishing/unpublishing.
- Editing metadata.
- Managing resources.
- Managing tabs.
- Managing quizzes/questions where practical.

Programmatic React interactive content can remain registry-based.

## Phase 10: V1 future shells

Goal: prepare without overbuilding.

Possible shells:

- Calendar/live sessions.
- Forum/community.
- Chat.
- AI tutor entry point.

Do not block core learning implementation on these.

## Phase 11: Pre-launch infrastructure

Goal: harden for real users.

Add:

- RDS Proxy.
- Caching.
- Observability.
- Billing alarms.
- Worker dead-letter queues.
- Access/XP/progress evals.
- Browser verification.
- Integration tests for critical flows.

## Phase 12: Framework upgrade hardening

Goal: upgrade framework/runtime versions only after the v1 UI and learning flows are stable.

Do separately from feature/design work:

- Create a dedicated upgrade branch.
- Evaluate Next.js 15 and React compatibility.
- Upgrade `next`, `eslint-config-next`, and related framework packages together.
- Re-run local build, lint/type checks, tests, and browser smoke tests.
- Check App Router behavior, SSR/hydration, caching, and route rendering changes.
- Keep deployment/CI/CD out of scope unless explicitly scheduled elsewhere.
