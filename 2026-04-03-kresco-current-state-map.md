# Kresco Current State Map

Date: 2026-04-03  
Repo: `C:\Users\ilyas\Desktop\kresco app`

## What This Document Is

This is my current model of the app after reading the codebase, the local database, the seed scripts, the integration docs, and the main frontend/backend routes.

This is not a marketing document. It is a working understanding document.

It is meant to answer four questions:

1. What is Kresco supposed to be?
2. What is actually implemented right now?
3. What is partially implemented, broken, or misleading?
4. What should be treated as the desired end state?

Where I am certain, I say so directly.  
Where I am inferring intent from UI copy, route names, docs, or data model drift, I call that out as an inference.

---

## Executive Summary

Kresco is clearly trying to be a Moroccan Bac learning platform with:

- Google sign-in and lightweight onboarding
- subject/chapter-based curriculum
- gated learning content
- premium/Pro subscription
- quizzes and XP gamification
- comments/community discussion
- a more focused study mode called "Zed Mode"
- some ambition around interactive labs/simulators
- some ambition around teacher/admin content management

The main problem is not lack of ideas. The main problem is that the app currently has **two competing content models**:

- a legacy **lesson-based** model
- a newer **section-based** model

That split now leaks into:

- watch flow
- progress tracking
- quiz triggers
- PDFs
- locking
- admin
- exams
- seeded local content

So the app is conceptually understandable, but **architecturally incoherent** in its current form.

My strongest conclusion:

> The app needs a single canonical learning unit and a single canonical curriculum path before more feature work is worth doing.

---

## What I Believe The Product Is Supposed To Be

### Core product idea

Kresco appears to be a premium-first e-learning platform for Moroccan Bac students.

The intended student journey looks like this:

1. Sign in with Google.
2. Set `niveau` and `filiere`.
3. Browse subjects aligned to the Moroccan Bac curriculum.
4. Enter a subject and follow a chapter-by-chapter learning path.
5. Consume content in multiple formats:
   - video
   - reading/text
   - quiz
   - interactive activity/simulator
6. Unlock progress progressively through gating.
7. Earn XP, streaks, leaderboard placement, and daily quest rewards.
8. Use notes/comments/support material while studying.
9. Upgrade to Pro to unlock the full experience.

### Secondary product ideas

There are at least three secondary product bets in the repo:

1. **Teacher/Admin tools**
   - create subjects
   - create chapters/sections
   - manage interactive activities
   - presumably manage educational content without touching Django admin directly

2. **Interactive learning**
   - section activities
   - simulators
   - drag-and-drop / fill-in-the-blank / ordering / matching / labeling / flashcards / classification

3. **Focused study environment ("Zed Mode")**
   - split-screen PDF + scratchpad
   - pomodoro/focus behavior
   - calculator
   - reminders
   - mascot/focus companion

### Inferred commercial model

The pricing page and payments code strongly imply:

- free users get preview access and limited progression
- Pro users get full curriculum access
- monthly and yearly plans exist
- Stripe is the billing provider

This is reinforced by:

- `frontend/app/pricing/page.tsx`
- `backend/payments/api.py`
- `docs/stripe-integration.md`

---

## Current Top-Level Architecture

### Frontend

- Framework: Next.js 14 App Router
- UI stack: React, Tailwind, Framer Motion, Zustand, Axios, Sonner
- Main app root: `frontend/app`

### Backend

- Framework: Django + Django Ninja
- API root: `backend/core/api.py`
- Domain apps:
  - `users`
  - `courses`
  - `quizzes`
  - `gamification`
  - `interactions`
  - `payments`

### Database

- Current local database: SQLite
- File: `backend/db.sqlite3`
- Backend env currently points to local SQLite

### Additional code surface

There is also a separate `src/` tree that looks like an older or parallel frontend/simulator app. It contains:

- `src/pages/*`
- `src/components/simulators/*`
- `src/physics/*`

This is not integrated cleanly with the current Next.js app and creates maintenance ambiguity.

---

## Current Frontend Surface

### `frontend/app/page.tsx`
Current role:

- landing/auth page
- Google Sign-In
- onboarding flow for:
  - `niveau`
  - `filiere`

What it communicates conceptually:

- Kresco is student-first
- auth is lightweight
- onboarding is minimal and profile-driven

### `frontend/app/(dashboard)/home/page.tsx`
Current role:

- dashboard / home feed
- greets the student
- loads subjects
- shows XP/streak/quests
- shows a small leaderboard slice
- shows progress cards for some subjects

This looks like the intended student control center.

### `frontend/app/(dashboard)/courses/page.tsx`
Current role:

- subject catalog
- search over subjects

This is the simple "browse all courses" screen.

### `frontend/app/(dashboard)/home/[subjectId]/page.tsx`
Current role:

- subject detail page
- shows chapters
- loads sections per chapter
- shows progress
- links to "exam blanc"
- presents the curriculum as a section-based path

This page strongly signals the desired future model:

> chapters contain sections, and sections are the actual learnable path.

### `frontend/app/watch/[lessonId]/page.tsx`
Current role:

- actual study/watch page
- despite the route name, it is trying to load a **section**
- tabs:
  - overview
  - lab
  - notes
  - support
  - comments

This page is the center of the real learning experience.

It wants to be a unified study shell for:

- watching video
- doing inline quizzes
- doing activities
- reading text content
- taking notes
- discussing content
- opening support PDFs

### `frontend/app/(dashboard)/exam/[subjectId]/page.tsx`
Current role:

- exam mode UI with timer, navigation, and result screen

But conceptually it is misleading:

- it is branded as a subject-level "exam blanc"
- in reality it just finds the first lesson in the subject that has a quiz and uses that

So the UI concept is "mock exam", but the implementation is "first available lesson quiz".

### `frontend/app/(dashboard)/classement/page.tsx`
Current role:

- leaderboard page

The leaderboard concept is real, but the contract has already drifted once and the current implementation is still rough.

### `frontend/app/(dashboard)/profile/page.tsx`
Current role:

- profile and learning stats page
- reads watched time, completed lessons, quizzes passed, Pro status

This should be the student's account/performance screen.

### `frontend/app/pricing/page.tsx`
Current role:

- free vs Pro comparison
- Stripe checkout buttons

The desired product positioning is strongly encoded here.

### `frontend/app/payment-success/page.tsx`
Current role:

- post-checkout confirmation
- verifies Stripe checkout session
- updates local auth store to `is_pro`

### `frontend/app/admin/*`
Current intended role:

- teacher/admin back office
- create courses
- inspect subjects
- build activities

Actual current role:

- mostly scaffolding
- partly fake
- partly dependent on non-existent backend endpoints
- not access-controlled by role

### `frontend/app/zed/page.tsx`
Current role:

- launches "Zed Mode"

This is one of the more distinct product ideas in the repo.

It suggests Kresco is not just a course player, but also a focused study workspace.

---

## Current Backend API Surface

From `backend/core/api.py`, the API is organized like this:

### Users / auth

- `POST /api/google-login`
- `GET /api/profile/me`
- `PATCH /api/profile/me`

### Courses

- `GET /api/courses/subjects`
- `GET /api/courses/subjects/{subject_id}`
- `GET /api/courses/chapters/{chapter_id}`
- `GET /api/courses/lessons/{lesson_id}`
- `GET /api/courses/lessons/{lesson_id}/activities`
- `GET /api/courses/lessons/{lesson_id}/stream`
- `GET /api/courses/lessons/{lesson_id}/pdfs`
- `GET /api/courses/chapters/{chapter_id}/sections`
- `GET /api/courses/sections/{section_id}/stream`

### Quizzes

- `GET /api/quizzes/{quiz_id}`
- `POST /api/quizzes/lessons/{lesson_id}/quiz/submit`

### Progress / gamification

- `GET /api/progress/subject-plan/{subject_id}`
- `POST /api/progress/update`
- `POST /api/progress/complete`
- `GET /api/progress/lessons/{lesson_id}/access`
- `POST /api/progress/section-complete`
- `GET /api/progress/sections/{section_id}/access`
- `GET /api/progress/xp`
- `GET /api/progress/xp/history`
- `GET /api/progress/lessons/{lesson_id}/quiz-triggers`
- `POST /api/progress/quiz-result`
- `GET /api/progress/leaderboard`
- `GET /api/progress/daily-quests`
- `POST /api/progress/daily-quests/{quest_id}/claim`
- `GET /api/progress/stats`

### Interactions

- `GET /api/interactions/comments`
- `POST /api/interactions/comments`

### Payments

- `POST /api/payments/create-checkout-session`
- `GET /api/payments/verify-session`

---

## Data Model: The Most Important Reality In The Repo

The app currently contains **two overlapping curriculum systems**.

## System A: Lesson-based curriculum (legacy but still active)

Main entities:

- `Subject`
- `Chapter`
- `Lesson`
- `Quiz` linked one-to-one to `Lesson`
- `Activity` linked to `Lesson`
- `CoursePDF` linked to `Lesson`
- `LessonProgress`
- `VideoQuizTrigger` linked to `Lesson`

Conceptually, this older system says:

> a chapter contains lessons; videos/quizzes/PDFs/progress all belong to lessons.

## System B: Section-based curriculum (newer UI direction)

Main entity:

- `ChapterSection`

A `ChapterSection` can be:

- `video`
- `quiz`
- `activity`
- `text`

And it carries fields for:

- gating
- VdoCipher id
- duration
- free preview flag
- text content
- embedded quiz JSON
- embedded activity JSON

Conceptually, this newer system says:

> a chapter contains sections; sections are the real atomic learning path.

## Why this matters

The new frontend study flow clearly wants System B.  
But System A still owns too many critical behaviors:

- legacy progress updates
- quiz triggers
- standalone quizzes
- support PDFs
- some seed data
- exam implementation

That is why the product feels half-migrated.

---

## Current Local Data Snapshot

Current counts in `backend/db.sqlite3`:

- `users`: 4
- `subjects`: 6
- `chapters`: 13
- `lessons`: 39
- `chapter_sections`: 46
- `quizzes`: 3
- `quiz_questions`: 10
- `quiz_options`: 40
- `activities`: 0
- `course_pdfs`: 0
- `video_quiz_triggers`: 0
- `comments`: 1
- `lesson_progress`: 4
- `content_progress`: 0
- `user_xp`: 3
- `xp_transactions`: 2
- `quiz_results`: 0
- `daily_quests`: 3

### What this implies

The local database is enough to demo:

- auth
- subjects/chapters
- some progress/XP data
- some sections
- some quizzes

But it is not enough to demo the full intended product because it lacks:

- activities
- support PDFs
- mid-video quiz triggers
- robust quiz coverage
- meaningful comments/discussion volume

---

## Seed Story: What The Local Demo Was Meant To Be

There are multiple seed commands:

### `backend/core/management/commands/seed_data.py`
This seeds the older lesson-based curriculum:

- 6 subjects
- chapters
- lessons
- chapter blocks
- 3 quizzes
- mock VdoCipher ids like `mock-video-*`

This represents a traditional course tree with quizzes attached to lessons.

### `backend/core/management/commands/seed_light_waves.py`
This seeds a more section-based content slice:

- a Physique-Chimie chapter called `Les ondes lumineuses`
- real VdoCipher video ids
- section-based video content
- simulator-aligned activity types

This represents the newer model.

### Important conclusion

Even the seed layer tells the same story as the UI/code:

> Kresco is in the middle of moving from lesson-based content to section-based content, but has not completed that migration.

---

## What Is Clearly Implemented Today

## 1. Authentication and onboarding

Confirmed:

- Google sign-in is wired on the frontend
- backend verifies Google tokens
- local auth state is stored in Zustand/localStorage
- onboarding captures `niveau` and `filiere`

This part of the product concept is coherent.

## 2. Basic student dashboard

Confirmed:

- subjects load
- progress summary is attempted
- quests load
- XP loads
- leaderboard loads

This is a real feature area, not a placeholder.

## 3. Subject browsing

Confirmed:

- subjects can be listed
- subjects can be searched
- subject detail pages load

## 4. Section-oriented learning path

Confirmed:

- chapter section objects exist
- subject detail renders sections
- watch page loads section-like content
- section completion endpoint exists

This is the strongest evidence of the current desired architecture.

## 5. Notes and comments

Confirmed:

- notes are stored locally per watched section
- comments API exists and supports `section`, `lesson`, and `chapter`

## 6. XP / streak / leaderboard / quests

Confirmed:

- XP model exists
- transactions exist
- streak logic exists
- leaderboard endpoint exists
- daily quest endpoint exists

## 7. Subscription/payments surface

Confirmed:

- pricing page exists
- checkout session endpoint exists
- payment success page exists
- `is_pro` field exists on user

This feature exists conceptually and in code, but not robustly.

## 8. Zed Mode

Confirmed:

- dedicated route exists
- focus overlay exists
- split-screen study workspace exists
- calculator / scratchpad / reminders/PDF support are represented

This is one of the more unique parts of the app.

---

## What Is Partially Implemented, Mismatched, Or Misleading

## 1. The watch route is really a section route, but it is still named like a lesson route

`frontend/app/watch/[lessonId]/page.tsx` is functionally trying to render a section, not a lesson.

That naming mismatch is not cosmetic. It is a symptom of the bigger migration problem.

## 2. Progress tracking is still partly lesson-based

The video player posts to the legacy progress endpoint with `lesson_id`, even though the page around it is section-based.

So the app currently has no single source of truth for "what the student is progressing through".

## 3. The exam feature is not really an exam feature

`frontend/app/(dashboard)/exam/[subjectId]/page.tsx` does not load a true subject exam.

It:

1. loads the subject
2. gathers lessons
3. finds the first lesson that happens to have a quiz
4. uses that as the "exam"

So "Examen blanc" is currently a mislabeled lesson quiz wrapper.

## 4. Admin is not a trustworthy operational interface yet

The custom admin routes imply a creator workflow, but:

- some stats are fake or hardcoded
- some expected API fields do not exist
- some create endpoints do not exist
- the pages themselves tell the user to use Django admin directly

This means the custom admin is not yet the system of record.

## 5. Payments are present, but not production-safe

The current payment flow proves the concept of "pay -> become Pro", but not the integrity of real subscriptions.

Missing/weak areas include:

- no robust user-session ownership verification
- no proper webhook-driven lifecycle management
- no complete cancel/failure/renewal handling
- hardcoded localhost success/cancel URLs in current implementation

## 6. Content support systems exist in the model but are mostly empty in the local dataset

Examples:

- `activities`
- `course_pdfs`
- `video_quiz_triggers`

So the app advertises a richer course experience than the local seeded content actually provides.

## 7. The "Live" idea exists only as a placeholder

The nav includes a "Live" item, but it only shows a toast.

So live learning/session functionality is not a real product feature yet.

## 8. Pricing promises likely exceed implementation

The pricing page promises:

- certificates
- priority support
- new content every week

I did not find complete supporting product flows for those promises in the repo.

## 9. Local mock content does not line up with current video integration logic

The old seed data uses fake VdoCipher ids.  
The stream endpoints expect either:

- no id
- or a mock secret
- or a real valid VdoCipher id

That makes the local experience brittle unless the environment is set exactly right.

## 10. The repo has documentation gaps

There is no root README explaining:

- what the product is
- how the models are supposed to fit together
- whether lessons or sections are canonical
- what `src/` is versus `frontend/`
- what is legacy versus current

That missing documentation is part of why the app is hard to reason about.

---

## What Seems To Be The Desired End State

This section is partly confirmed and partly inferred.

## Desired state 1: A structured Bac curriculum platform

Desired:

- subjects
- chapters
- a clear in-order learning path
- content tailored to Moroccan Bac students

This is clearly encoded everywhere.

## Desired state 2: A richer content unit than just video

Desired:

- video sections
- text sections
- quiz sections
- activity/lab sections

This strongly suggests the intended end state is **section-based**, not lesson-only.

## Desired state 3: Premium gating with real educational progression

Desired:

- some free preview content
- premium locked content
- ordered progression through sections
- maybe prerequisite logic

This exists in the data model and UI language, even if not consistently enforced.

## Desired state 4: A gamified learning loop

Desired:

- XP
- streaks
- quests
- leaderboard
- progress visibility

This is deeply embedded in both backend and frontend.

## Desired state 5: A serious study environment

Desired:

- notes
- comments
- support materials
- labs/simulators
- Zed Mode for deep work

That is more ambitious than a normal video course site.

## Desired state 6: Content authoring without engineering intervention

Desired:

- teacher/admin content management
- activity creation
- subject/chapter/section creation
- eventually less reliance on raw Django admin

Right now the custom admin does not fulfill that promise.

---

## My Best Current Interpretation Of The "Right" Product Model

If I had to describe the intended product in one paragraph:

> Kresco should be a Moroccan Bac learning platform where a student signs in with Google, picks their level and track, enters a subject, follows a section-based guided curriculum made of videos/readings/quizzes/labs, earns XP and streaks, discusses lessons, upgrades to Pro for full access, and can optionally switch into a focused Zed study workspace.

That is the clearest unified concept I can derive from the repo.

---

## What Does Not Currently Add Up

These are the biggest conceptual contradictions in the app:

## Contradiction 1: What is the true learning unit?

Possibilities currently present in code:

- lesson
- section
- quiz attached to lesson
- activity attached to lesson
- activity embedded in section

This needs one answer.

## Contradiction 2: What is the true back office?

Possibilities currently present in code:

- custom `/admin` frontend
- raw Django admin

This needs one answer.

## Contradiction 3: What is a real exam?

Current possibilities:

- a true subject-level exam
- a re-skinned lesson quiz

This needs one answer.

## Contradiction 4: What is the local dev/demo environment supposed to simulate?

Current possibilities:

- fake/mock VdoCipher videos
- real VdoCipher-backed section videos

This needs one answer.

## Contradiction 5: Is this one frontend or two?

Current possibilities:

- `frontend/` as the real app
- `src/` as legacy code
- `src/` as reusable simulator domain code

This needs one answer.

---

## Decision Points The Project Needs

These are the project-level decisions I think need to be made explicitly.

## 1. Choose the canonical curriculum unit

Recommended decision:

- make `ChapterSection` the canonical unit for the student experience

Then decide the fate of `Lesson`:

- keep it only as a backend/media artifact
- or migrate fully away from it
- or formally map `Lesson -> one video section`

But stop allowing both models to define the UX independently.

## 2. Choose the content authoring strategy

Either:

- invest in the custom admin until it is real

or:

- remove/hide it and rely on Django admin until a true internal tool is ready

Right now it is in the dangerous middle.

## 3. Choose the real exam strategy

Either:

- build true subject/chapter exams as first-class data

or:

- rename the current feature so it stops pretending to be more than it is

## 4. Choose the local demo strategy

Either:

- support a fully offline/mock local demo cleanly

or:

- require real external integrations in local dev and document that clearly

Current state does neither cleanly.

## 5. Choose what belongs in the product now versus later

Features that feel later-stage or not yet real:

- Live sessions
- certificates
- weekly content promise
- full teacher back office

These should either be built properly or removed from active product messaging.

---

## What I Would Call "Implemented", "Prototype", And "Fake"

## Implemented enough to count as real

- Google auth + onboarding
- subject browsing
- section-based subject detail UI
- section watch shell
- basic XP/quests/leaderboard infrastructure
- comments API
- pricing/paywall concept
- Zed Mode shell

## Prototype / semi-real

- section completion
- section gating
- payment upgrade flow
- admin tooling
- exam mode
- notes/support/lab integration around study

## Fake / placeholder / misleading right now

- Live sessions
- trustworthy teacher/admin product
- robust premium billing lifecycle
- true subject-wide exam system
- mature certificates/support promises

---

## Suggested Product Narrative Going Forward

If the project were cleaned up, the story should probably become:

1. Kresco is for Moroccan Bac students.
2. Subjects contain chapters.
3. Chapters contain sections.
4. Sections can be video, reading, quiz, or lab.
5. Students progress section by section.
6. Progress drives XP, quests, streaks, and leaderboard.
7. Pro unlocks the full curriculum.
8. Zed Mode is the focus/study workspace that complements the curriculum.

That story is coherent.  
The current codebase almost tells that story, but keeps getting interrupted by the old lesson-based system.

---

## Suggested Technical Direction

## Phase 1: Canonical model cleanup

- make section the canonical learning unit
- reconcile or retire lesson-based progress APIs
- decide how quizzes/PDFs/triggers attach in the new world
- add a direct section detail endpoint

## Phase 2: Core flow stabilization

- make watch flow deterministic
- make local video demo deterministic
- align profile stats contract
- align gating contract
- align support material contract

## Phase 3: Trust and operations

- secure payments properly
- add real role-based admin access
- either finish or hide the custom admin
- clean up production settings

## Phase 4: Product honesty

- remove fake/coming-soon nav items
- remove unsupported pricing claims
- rename the exam feature if it is not a real exam

## Phase 5: Documentation

Add a real root README that answers:

- what Kresco is
- what `Lesson` vs `ChapterSection` means
- what the current canonical model is
- what `src/` is
- what is legacy
- how to run the app locally

---

## Open Questions / Unknowns

These are things I still do not know with certainty from code alone:

1. Whether the final intended canonical model is definitely `ChapterSection`, or whether `Lesson` is supposed to survive as a student-facing object.
2. Whether the custom admin is meant to replace Django admin fully, or only complement it.
3. Whether the `src/` simulator app is meant to be merged into the current frontend, extracted, or deleted.
4. Whether exams are meant to be generated dynamically from existing quizzes or modeled as first-class exam objects.
5. Whether comments are supposed to be central to the learning experience or just a secondary feature.
6. Whether Zed Mode is a flagship product differentiator or an experimental side feature.

---

## Final Honest Assessment

Do I fully understand the concept of the app?

My honest answer:

- I understand the **overall product ambition** well.
- I understand the **current implementation reality** well enough to map its major systems and contradictions.
- I do **not** believe the repo itself currently expresses one perfectly unified concept.

That is not a comprehension problem on my side.  
It is a coherence problem in the product/codebase as it exists today.

My best single-sentence understanding is:

> Kresco wants to be a gamified, premium Moroccan Bac learning platform built around guided section-based study, but it is currently still entangled with an older lesson-based architecture and a partially built internal content/admin system.

---

## Reference Pointers

Useful files that define the current picture:

- `frontend/app/page.tsx`
- `frontend/app/(dashboard)/home/page.tsx`
- `frontend/app/(dashboard)/home/[subjectId]/page.tsx`
- `frontend/app/watch/[lessonId]/page.tsx`
- `frontend/app/(dashboard)/exam/[subjectId]/page.tsx`
- `frontend/app/pricing/page.tsx`
- `frontend/app/admin/*`
- `frontend/app/zed/page.tsx`
- `frontend/components/VideoPlayer.jsx`
- `frontend/components/VideoQuizOverlay.tsx`
- `frontend/components/TopNav.tsx`
- `frontend/lib/subjectProgress.ts`
- `backend/core/api.py`
- `backend/courses/models.py`
- `backend/courses/api.py`
- `backend/quizzes/api.py`
- `backend/gamification/models.py`
- `backend/gamification/api.py`
- `backend/interactions/api.py`
- `backend/payments/api.py`
- `backend/core/management/commands/seed_data.py`
- `backend/core/management/commands/seed_light_waves.py`
- `TODO-MANUAL.md`
- `docs/stripe-integration.md`
- `docs/vdocipher-integration.md`
- `docs/aws-deployment.md`
