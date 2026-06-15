# Exam Bank, Exercise Bank, Quiz, And XP Implementation Plan

This plan focuses only on four connected product areas:

- Bac Exam Bank.
- Exercise Bank.
- Quiz System.
- XP, Leaderboard, Badges, Mastery, and Mistake Notebook.

The current code already has useful foundations:

- `Exam` and `ExamProblem` in `backend/app/models/courses.py`.
- Exam Bank API at `GET /api/courses/exam-bank`.
- `QuestionSet` and `Question` in `backend/app/models/quizzes.py`.
- `QuizAttempt` and `QuestionAttempt` in `backend/app/models/gamification.py`.
- Backend quiz submission through `backend/app/services/quiz_attempt_submission.py`.
- XP transactions through `backend/app/services/xp.py`.
- Daily quests, sidebar summary, and leaderboard read models.

So this is not a greenfield build. The work is to turn the existing foundations
into one serious learning system.

## Product Principle

The four areas must share one learning model:

```text
Subject
-> Topic
-> TopicSection
-> TopicItem
-> QuestionSet
-> Question
-> QuizAttempt / QuestionAttempt
-> XPTransaction / Mastery / MistakeNotebook
```

Exam problems and exercises should not become separate isolated worlds. They
should attach to the same subjects, topics, concepts, attempts, XP, mastery, and
mistake notebook.

## Milestone 1: Canonical Question And Content Model

Goal: every official question, exercise, and exam problem has consistent
metadata and can feed quizzes, attempts, XP, search, and recommendations.

### 1.1 Quiz Question Model

Keep `QuestionSet` and `Question` as the canonical quiz model, but expand their
usage beyond topic tabs.

Required question metadata:

- `subject_id`
- `topic_id`
- `topic_section_id`
- `topic_item_id`
- `tab_content_id`
- `source_type`
- `difficulty`
- `concept_slugs`
- `status`
- `order`
- `external_id`
- `config_json`
- `answer_json`

Supported question types:

- `multiple_choice`
- `true_false`
- `fill_in_blank`
- `matching`
- `ordering`
- `drag_and_drop`
- `short_answer`
- `numeric_answer`
- `multi_select`
- `interactive_checkpoint`

Add if missing:

- Validation service for each question type.
- Admin validation before publish.
- Import format for bulk questions.
- Version snapshot strategy for published question sets.

Difficulty should be controlled across quiz questions, exercises, and exam
problem parts:

```text
difficulty: easy | normal | hard | bac | challenge
```

Concept tags should be shared across quiz questions, question sets, exercises,
exam problem parts, topic items, and resources. They are controlled slugs, but
content authors can create or propose new tags during authoring/import. Admin
tools must support merge, rename, approval/cleanup, and duplicate detection.
Proposed tags can be attached internally, but student-facing filters/search only
show approved tags.

Acceptance tests:

- Invalid question config cannot publish.
- Correct answer data is never sent in student quiz payloads before submit.
- Draft questions are invisible to students.
- Published edits do not corrupt old attempts.

### 1.2 Exercise Bank Model

Exercise Bank is a separate student-facing practice environment, not a quiz UI
and not the normal TopicItem rail. Exercises should be first-class practice
content shown under a dedicated exercise tab/surface with their own browsing,
detail, correction reveal, comments, saves, and solved/retry status.

Preferred v1 pattern:

```text
Subject / Topic / TopicSection
-> Exercise
-> ExerciseCorrection
-> UserExerciseStatus
-> UserExerciseSelfGradeHistory
-> comments / saves / activity
```

Exercises do not use `QuestionSet` or `Question` as their primary model. The
quiz engine remains separate and only handles official graded quiz questions.
The Exercise Workspace exposes the broad exercise bank across subjects and
topics. The Topic Workspace can still include curated professor/content-team
practice sections such as selected exercises, Bac examples, and devoir blanc.
Those curated Topic Workspace exercises do not source from broad Exercise Bank
`Exercise` records. They are separate guided topic content, selected and
sequenced for lesson flow.

Exercise fields:

- Subject.
- Topic.
- Section.
- Filière scope.
- Title.
- Difficulty.
- Concepts.
- Statement rich body.
- Statement assets/images.
- Hints.
- Rich correction body.
- Correction assets/images.
- Optional video correction resource.
- Status.
- Source/license.

Video correction is optional. Exercise Bank's primary value is written practice
with rich LaTeX corrections and assets, not recorded videos. Use:

```text
correction_kind: written_only | video_only | written_and_video
```

Most exercises should work as `written_only`.

Exercise filière metadata:

```text
filiere_scope: all | specific
filiere_slugs: ["pc", "svt"]
```

Most exercises will be specific to one or a few filières, but the model should
allow shared exercises, especially where SVT or general science practice
overlaps with other tracks.

Exercise statement and correction content should use sanitized rich HTML with
LaTeX delimiters and controlled image/asset references. Do not accept arbitrary
raw HTML image/script/embed content. Correction v1 should be one rich
LaTeX-capable solution body with optional embedded assets. Do not model ordered
solution steps in v1 unless content production proves that structure is
necessary.

Exercise assets should use one generic model in v1:

```text
ExerciseAsset
- exercise_id
- placeholder_key
- asset_kind: image | diagram | graph_image | pdf | worksheet
- storage_ref
- alt_text
- caption
- order
- metadata_json
```

Diagrams and graphs are stored as controlled assets first. Only create a
separate interactive graph/diagram renderer later if the content needs actual
manipulation, animation, or generated data.

Exercise rich bodies reference assets with stable placeholders:

```html
<p>On obtient le schema suivant :</p>
<p>{{asset:diagram-1}}</p>
<p>Donc \( F = ma \).</p>
```

The frontend renderer replaces `{{asset:diagram-1}}` with the matching
`ExerciseAsset.placeholder_key = "diagram-1"`. Arbitrary `<img>` tags and raw
image URLs are not part of the v1 authoring contract.

Student states:

- Not started.
- Viewed statement.
- Correction revealed.
- Self-graded.
- Solved.
- Mastered.
- Retry later.

`Solved` is self-reported by the student. It is useful for progress, history,
and recommendations, but it is not proof of correctness and should not be
treated like passing an official backend-graded quiz.

Correction reveal does not require a quiz-like submit action. The student should
spend a short minimum time on the statement first, then reveal the correction and
self-grade their understanding. That self-grade becomes filterable later for
revision, especially months after the first attempt.

The reveal delay is frontend-only. Backend should enforce access/redaction, but
it should not reject correction reveal because a timer has not elapsed.

Exercise self-grade states:

- `again`: the student did not get it and wants to redo it later.
- `partial`: the student understood after viewing the correction.
- `mastered`: the student solved it confidently.

Persist correction reveal immediately:

```text
POST /api/courses/exercises/{exercise_id}/reveal-correction
-> sets UserExerciseStatus.correction_revealed_at
-> returns correction body and assets if access allows
```

Persist self-grade as both current state and history:

```text
POST /api/courses/exercises/{exercise_id}/self-grade
-> updates UserExerciseStatus.self_grade
-> appends UserExerciseSelfGradeHistory row
```

This allows filters such as "show my current partial exercises" and later
analysis such as "this exercise moved from again to partial to mastered."
Difficulty stars/bars represent content difficulty only, not self-grade or
mastery.

Acceptance tests:

- Exercise list supports subject/topic/filière/difficulty/concept/status
  filters.
- Exercise detail shows statement first and correction only after a short
  reading/attempt delay.
- Solved/retry/correction-revealed/self-grade state is user-scoped and
  idempotent.
- Correction visibility respects access gates.
- Self-reported solved status does not award the same XP or mastery confidence
  as backend-graded quiz correctness.
- Current self-grade is filterable.
- Self-grade history is preserved.

### 1.3 Exam Bank Model

Current `Exam` and `ExamProblem` are the base. Extend behavior around them
before adding more tables.

Exam Bank must support:

- Full exam browsing.
- Problem-level browsing.
- Source type filter.
- Subject filter.
- Filière filter.
- Topic filter.
- Year filter.
- Session type filter.
- Concept filter.
- Difficulty filter.
- Written solution availability.
- Video solution availability.
- Completion / attempted / saved filters.

Exam problem fields:

- Source type.
- Filière.
- Year.
- Session type.
- Statement.
- Written solution.
- Written solution PDF/image URL if needed.
- Optional video solution resource.
- Topic link.
- Concept slugs.
- Difficulty.
- Status.
- Free preview / tier / feature gate.
- Source/license metadata.

Exam source metadata:

```text
source_type: official_bac | kresco_authored
session_type: normal | rattrapage | mock
filiere: pc | svt | sma | smb | ...
year: 2024
```

These values must be filterable and visible in the student UI so official Bac
material is not confused with Kresco-authored exam-style practice.
`filiere` values should be controlled slugs, not free text.

Exam problems should support parts:

```text
Exam
-> ExamProblem
-> ExamProblemPart
-> ExamProblemPartContent
```

`ExamProblem` stores the overall Bac problem and énoncé. `ExamProblemPart`
stores part-level statement fragments, written correction, optional video
correction resource, difficulty/concepts, order, and user progress/revision
signals. This is necessary because Bac corrections are often taught per part,
not only as one whole-problem correction.

Exam Bank should use its own content model. Do not use `TopicItem`, `TabContent`,
`Exercise`, or `QuestionSet` as the primary storage model for exam problems or
exam part capsules.

Exam Bank and Exercise Bank remain completely separate primary models in v1.
Exam parts do not generate, source from, or directly link to Exercise Bank
`Exercise` records. They can share subject, topic, filière, difficulty, and
concept metadata for filtering and analytics.

The student-facing Exam Bank study unit is the Exam Part Capsule:

```text
Exam Part Capsule
- video correction above
- written énoncé below
- optional rich written correction
- optional formulas tab
- optional lab/simulation tab
- optional resources tab
- optional notes/revision tab
```

Supporting content model:

```text
ExamProblemPartContent
- exam_problem_part_id
- content_type: formula | lab | resources | notes_seed | rich_text
- label
- body_html
- renderer_key
- config_json
- order
```

Self-grade, progress, video watch state, correction reveal/view state, and retry
state belong at `ExamProblemPart` level. Whole-problem progress can be derived
from its parts.

Add tracking:

- Exam problem opened.
- Exam problem attempted.
- Written solution viewed.
- Video solution watched.
- Problem completed.
- Problem saved.
- Exam problem part opened.
- Exam problem part correction viewed.
- Exam problem part video watched.
- Exam problem part self-graded.
- Exam problem part marked retry-later.

Acceptance tests:

- Locked exam videos do not leak provider IDs or URLs.
- Problem filters never return unauthorized private data.
- Problem attempt state is idempotent.
- Exam problem activity feeds XP/mastery/mistake notebook.

## Milestone 2: One Official Quiz Engine

Goal: one official path for quiz rendering, submission, grading, attempts,
history, progress, and XP.

### 2.1 Backend Quiz Engine

Keep backend grading as the only source of truth.

Core services:

- Load accessible question set.
- Validate submitted answer shape.
- Grade each question.
- Persist `QuizAttempt`.
- Persist `QuestionAttempt`.
- Award XP using idempotency keys.
- Update progress/mastery/mistake notebook.
- Return safe result payload.

Submission flow:

```text
GET question set
-> render safe questions
-> student submits answers
-> backend validates answer shape
-> backend grades each question
-> persist QuizAttempt
-> persist QuestionAttempt rows
-> award XP
-> update mastery
-> update mistake notebook
-> return result
```

Required result data:

- Score.
- Pass/fail.
- Correct count.
- Total.
- Per-question safe grading summary.
- Explanation after submit.
- XP earned.
- Attempt number.
- Retry recommendation.

Acceptance tests:

- Client-supplied score/pass fields are ignored.
- Duplicate submission hash is idempotent.
- Attempt numbers are stable under repeated submits.
- A failed submit does not partially award XP.
- Every official quiz route uses the same persistence service.

### 2.2 Frontend Quiz Renderer

Consolidate quiz UI around one official renderer.

Renderer requirements:

- Supports all official question types.
- Has loading, empty, locked, error, and submitted states.
- Does not embed answer correctness before submission.
- Can render:
  - Topic tab quiz.
  - Exam problem quiz/checkpoint.
  - Standalone practice quiz.
  - Daily quest quiz prompt if needed.

Separate:

- Official progress quizzes.
- Demo/showcase quizzes.
- Local frontend-only practice components.

Acceptance tests:

- Official renderer submits only answers, not score/pass.
- Locked state links to access explanation.
- Retry keeps previous attempt history visible.
- Each question type has at least one render/submit test.

### 2.3 Quiz Versioning

Problem: if a published question changes, old attempts must still make sense.

Approach:

- Add `question_set_versions` or snapshot JSON on `QuizAttempt`.
- Store enough question prompt/config/answer/explanation snapshot to audit old
  attempts.
- New edits create a new version.
- Old attempts read their version/snapshot.

Acceptance tests:

- Student attempt from version 1 remains auditable after version 2 publishes.
- Admin cannot silently mutate the historical correct answer for old attempts.

## Milestone 3: Attempt, Progress, And Mistake Notebook

Goal: attempts are useful for learning, not only score storage.

### 3.1 Attempt History

Student views:

- Attempts by quiz.
- Attempts by topic.
- Attempts by exercise.
- Attempts by exam problem.
- Best attempt.
- Latest attempt.
- First attempt.

Backend:

- Add optimized read models where needed.
- Cursor paginate history.
- Include context links back to exact topic/item/tab/problem.

Acceptance tests:

- History is user-scoped.
- Another user cannot read attempts.
- Links restore exact context.

### 3.2 Mistake Notebook

Sources:

- Wrong quiz questions.
- Repeated weak concepts from verified quiz attempts.

Exercise and Exam Bank revision signals do not feed a unified Revision Queue in
v1. They stay as filters inside their own bank workspaces, for example
`again`, `partial`, `mastered`, saved, and retry-later. A suggested unified
revision queue can be considered later, but it is out of v1 scope.

Data model:

- `mistake_notebook_entries`
- `mistake_review_attempts`

Entry fields:

- User.
- Subject/topic/section/item context.
- Question set/question context.
- Concept slugs.
- Source attempt.
- Mistake type.
- Status: open, reviewing, mastered, dismissed.
- Retry due date.
- Last reviewed.

Student features:

- Notebook page.
- Weak concepts grouping.
- Exact deep links.
- Mark reviewed/mastered.

Acceptance tests:

- Wrong answer creates one open notebook entry.
- Repeating the same mistake updates the entry, not duplicates it endlessly.
- Correct retry can mark mastered.
- Notebook entries respect content access gates.

### 3.3 Mastery Model

Start simple but durable.

Table:

- `user_concept_mastery`

Fields:

- User.
- Subject.
- Topic.
- Concept slug.
- Mastery score.
- Confidence.
- Last evidence at.
- Correct count.
- Wrong count.
- Streak.
- Decay/review due date.

Signals:

- Correct question.
- Wrong question.
- Quiz pass.
- Mistake reviewed.

Exercise self-grades and Exam Part self-grades can be used as low-confidence
analytics later, but v1 revision behavior stays inside each bank's filters
rather than a unified queue.

Acceptance tests:

- Correct answers increase mastery.
- Wrong answers decrease confidence or increase review need.
- Mastery is user-scoped.
- Duplicate submissions do not double count.

## Milestone 4: XP Economy And Leaderboards

Goal: XP rewards real verified learning and resists farming.

### 4.1 XP Economy Rules

Write `docs/xp-economy.md` before changing reward values.

Define:

- Which actions earn XP.
- Base amount.
- Max frequency.
- Idempotency key.
- Daily cap category.
- Whether repeats earn XP.
- Whether admin can reverse.
- How it affects quests/mastery.

Suggested v1 rewards:

- First correct question: small XP.
- First quiz pass: medium XP.
- Perfect quiz first time: bonus XP.
- Exercise self-grade: tiny/small XP, capped, because it is self-reported.
- Exercise mastered first time: small XP, capped, not equivalent to verified
  quiz/exam correctness.
- Exam problem completed: high XP.
- Mistake reviewed and corrected: medium XP.
- Video completed: small XP.
- Lab completed: medium XP.
- Daily quest claimed: fixed XP.

Do not reward:

- Opening a page repeatedly.
- Replaying the same video endlessly.
- Submitting identical answers repeatedly.
- Frontend-only scores.
- Repeatedly changing Exercise self-grade to farm XP.

### 4.2 XP Transaction Improvements

Current `XPTransaction` is append-only for positive XP. Extend carefully.

Add:

- Reversal/adjustment transaction type.
- Admin correction reason.
- Category.
- Season id.
- Cap bucket.
- Source attempt references.

Possible table additions:

- `xp_seasons`
- `xp_daily_cap_usage`
- `badge_definitions`
- `user_badges`

Acceptance tests:

- Duplicate idempotency key does not award XP.
- Daily category caps are enforced.
- Admin reversal updates user total.
- XP total never goes negative.
- XP history explains the user total.

### 4.3 Daily Quests And Subject Quests

Expand current daily quests.

Quest types:

- Complete lesson/topic item.
- Pass quiz.
- Correct weak concept.
- Review mistake.
- Complete exam problem.
- Earn XP.
- Subject-specific quest.
- Bac-prep quest.

Acceptance tests:

- Quest progress updates from XP/activity signals.
- Claim is idempotent.
- Expired quest cannot be claimed.

### 4.4 Leaderboards, Seasons, Badges

Leaderboards:

- All-time.
- Weekly.
- Monthly.
- Semester.
- Subject-specific.
- League grouping.

Badges:

- First quiz pass.
- Perfect quiz.
- Exam grinder.
- Weak-topic comeback.
- Streak.
- Subject mastery.

Acceptance tests:

- Leaderboard reads projection, not expensive request-time ranking.
- Season reset does not delete XP history.
- Badges are idempotent.

## Milestone 5: Search, Filters, And Student UX

### 5.0 Exercise Workspace

The Exercise Bank should be a full separate workspace, not a Topic Workspace tab
and not an active-item panel. Topic pages can link into it with context, but the
exercise experience itself lives outside the lesson/video workspace.

This does not remove curated practice from the Topic Workspace. Topic Workspace
can still contain selected professor/content-team practice items:

```text
Topic Workspace
-> Lessons
-> Curated Topic Exercises
-> Bac Examples
-> Devoir Blanc
-> Synthese / Revision
```

The distinction is:

- Exercise Workspace: the broad searchable/filterable bank.
- Curated Topic Exercises: separate selected exercises inside the guided topic
  flow, not references to Exercise Bank records.
- Bac Examples: selected Bac examples inside the guided topic flow.
- Exam Bank: the broad searchable/filterable exam workspace.
- Devoir Blanc: mock exam / exam-style assessment inside the guided topic flow.

Curated Topic Exercises should use `TopicItem` in v1 because they are part of
the guided Topic Workspace sequence. Add a distinct `item_type`, for example
`curated_exercise`, plus metadata such as `required`, `recommended`,
`professor_selected`, `has_video_correction`, and `practice_kind`. Do not link
these items to broad Exercise Bank `Exercise` records.

Current code shape to avoid:

- Existing Topic Workspace tabs are item-level slots in
  `frontend/lib/topicWorkspaceTabs.ts`.
- Existing `TabPanel` renders a `TabContent` for the active `TopicItem`.
- Exercises should not be added as many `TopicItem` rail entries, should not be
  modeled as quiz `TabContent`, and should not become a Topic Workspace tab.

Backend implementation:

- Add `Exercise` and `ExerciseCorrection` models.
- Add user state model, for example `UserExerciseStatus`.
- Link exercises to `subject_id`, `topic_id`, optional `topic_section_id`,
  difficulty, concept slugs, status, and access gates.
- Add `GET /api/courses/exercises`.
- Accept filters: subject_id, topic_id, difficulty, concept, self-grade, status,
  q.
- Add `GET /api/courses/exercises/{exercise_id}` for detail.
- Add `POST /api/courses/exercises/{exercise_id}/reveal-correction`.
- Add `POST /api/courses/exercises/{exercise_id}/self-grade`.
- Add `POST /api/courses/exercises/{exercise_id}/save` or reuse the existing
  saves endpoint with `target_type="exercise"`.
- Add comments support with `target_type="exercise"` or a dedicated exercise
  comment context.

Frontend implementation:

- Add a dedicated Exercise Workspace route, for example `/exercises`.
- The route fetches `/courses/exercises`.
- It renders:
  - a top subject selector using visual icon/card buttons for the five
    configured Bac subjects;
  - a lightweight topic overview after subject selection;
  - topic cards/buttons with counts such as total exercises, not-started,
    partial, mastered, and difficulty mix;
  - Topic Exercises after the student selects a topic such as Ondes, replacing
    the overview instead of keeping it pinned above the list;
  - filter bar for difficulty, concept, self-grade, status, search;
  - screenshot-style exercise grid cards with exercise number/title, difficulty
    stars or bars, concepts, correction availability, self-grade chip, status
    marker, save state, and a primary CTA such as `s'exercer` or `revoir`;
  - full-page Exercise Detail route after selecting a card;
  - Exercise Detail uses a wide reading column and a sticky desktop utility
    rail, not a plain centered blob;
  - reading column: statement first, diagrams/graphs inline, reveal correction
    button, correction body below the statement after reveal;
  - sticky utility rail: current status, difficulty, concepts, save action,
    correction reveal/revealed state, comments button/count, and previous/next
    exercise navigation;
  - previous/next exercise navigation follows the current cached Topic
    Exercises filtered result set, not the unfiltered topic default order;
  - self-grade buttons are hidden before correction reveal;
  - after correction reveal, show self-grade buttons: `again`, `partial`,
    `mastered`;
  - comments behind a dedicated Comments tab/section, not inline in the main
    statement/correction flow;
  - no statement/correction split view in v1; that can be a later desktop-only
    enhancement if needed.
  - on mobile, collapse the utility rail into top metadata plus a sticky bottom
    action bar.

URL behavior:

- Global Exercise Workspace: `/exercises`.
- Topic-filtered Exercise Workspace: `/exercises?topic={topicId}`.
- Subject-filtered Exercise Workspace: `/exercises?subject={subjectId}`.
- Normal browsing hierarchy is Subject -> Topic Overview -> Topic Exercises ->
  filters.
- Selected exercise opens as a full-page detail route:
  `/exercises/{exerciseId}`.
- Topic Workspace can link to `/exercises?topic={topicId}`.
- Back navigation from Topic Exercises returns to the cached Topic Overview for
  the selected subject, preserving scroll and loaded counts.
- Back navigation from Exercise Detail returns to the cached Topic Exercises
  grid with filters, scroll position, and loaded cards preserved.
- Use aggressive client caching/prefetching for subject topic counts and topic
  exercise lists so moving back and forth does not feel like a reload.

Access behavior:

- Exercise Bank access is subject-level through the existing subject
  entitlement model.
- Freemium/free-preview exercises can be exposed as explicit previews, but v1
  does not use separate exercise-level paid gates.
- Locked subject cards and locked exercise cards remain visible with clear lock
  states, but locked statements and corrections are redacted from API payloads.
- Clicking a locked subject opens a locked subject preview, not a direct
  checkout/payment jump.
- The locked preview shows topic counts, sample exercise cards, what is locked,
  why it is locked, how to unlock it, and the benefits of unlocking this subject
  across lessons, Exercise Workspace, Exam Bank, corrections, and revision.
- The preview CTA routes to the pricing/access page. Pricing plan design is out
  of scope for this bank organization plan.
- If topic access is locked, topic-filtered Exercise Workspace shows locked
  access state where appropriate.
- Free-preview exercises can be shown according to freemium preview rules.
- Correction content must be redacted for locked exercises.

Acceptance tests:

- Exercise Workspace loads independently from Topic Workspace.
- Topic links preserve subject/topic filter context.
- Back navigation from topic list to topic overview restores cached data and
  scroll state.
- Filters update results without changing Topic Workspace state.
- Correction reveal is unavailable before the minimum delay.
- Revealing correction records user state idempotently.
- Self-grade persists and is filterable.
- Locked correction content is not leaked in the API response.

### 5.1 Exam Bank UX

Pages:

- `/exam-bank`
- `/exam-bank/[examId]`
- `/exam-bank/problems/[problemId]`

Controls:

- Top subject selector with icon/card buttons for the five configured Bac
  subjects.
- Year.
- Session.
- Topic.
- Concept.
- Difficulty.
- Has video.
- Has written solution.
- Attempt status.
- Saved status.

Student cards should show:

- Access state.
- Year/session.
- Topic/concepts.
- Solution availability.
- Progress status.
- Save action.

Access behavior:

- Exam Bank browsing is also subject-first.
- Exam metadata stays visible when locked: subject, filiere, year, session,
  source type, problem count, topics, and solution availability.
- Bank access is subject-level in v1, with optional freemium/free-preview
  samples.
- When the subject is locked, protected video, written correction, and full part
  detail must be redacted.
- If the whole subject is locked, keep the card visible and route the CTA toward
  a locked subject preview instead of opening the protected detail or jumping
  directly to payment.
- The locked preview should explain how to unlock and frame the value as "unlock
  all of this" for the selected subject: exam problems, part capsules, written
  corrections, videos, Exercise Workspace access for the same subject, and
  revision filters.
- The preview CTA routes to the pricing/access page. Pricing plan design is out
  of scope for this bank organization plan.

### 5.2 Exercise Workspace UX

Pages:

- `/exercises`
- `/exercises/{exerciseId}`
- `/exercises?subject={subjectId}`
- `/exercises?topic={topicId}`

Default view:

- Use grid cards like the provided exercise screenshot, not dense table rows.
- Put the topic title above the filters, for example `Ondes`.
- Filters sit directly below the topic title: difficulty, self-grade/status,
  saved, concept, and search.
- Cards show the exercise number/title, difficulty indicator, correction
  availability, current status, and CTA.
- The main card status marker represents the student's current exercise state:
  `not_started`, `again`, `partial`, or `mastered`.
- Difficulty remains visually separate as stars or bars and never represents
  self-grade/mastery.
- CTA mapping:
  - `not_started` -> `s'exercer`
  - `again` -> `continuer`
  - `partial` -> `continuer`
  - `mastered` -> `revoir`

Controls:

- Top subject selector with icon/card buttons for the five configured Bac
  subjects.
- Topic.
- Concept.
- Difficulty.
- Self-grade.
- Current status.
- Correction type.
- Video available.

Student flow:

```text
find exercise
-> read statement
-> reveal correction after frontend delay
-> self-grade
-> save, mark retry later, or add to notebook
```

### 5.3 XP / Mastery UX

Pages/widgets:

- XP summary.
- Quest widget.
- Leaderboard.
- Badge inventory.
- Mastery by concept.
- Mistake notebook.
- Attempt history.

UX rules:

- Always explain why XP was awarded.
- Locked content should not look broken.
- Empty states should suggest next useful action.

## Milestone 6: Backoffice For These Areas

Backoffice is required for this focused roadmap. SQLAdmin is not enough.

### 6.1 Content Staff

Backoffice tools:

- Exam list/editor.
- Exam problem editor.
- Exercise editor.
- Exercise bulk import.
- Question editor.
- Bulk import.
- Validation preview.
- Publish/unpublish.
- Broken media/correction queue.
- Quality status.

Exercise backoffice editor requirements:

- Create/edit Exercise.
- Create/edit rich statement body.
- Create/edit rich correction body.
- Upload/manage Exercise Assets.
- Insert and validate `{{asset:key}}` placeholders.
- Set subject, topic, filière scope, difficulty, concepts, source/license.
- Preview student card.
- Preview full Exercise Workspace detail.
- Validate LaTeX/rendering.
- Validate concept tags and mark new tags as proposed.
- Save draft.
- Publish/unpublish.
- Use lightweight content statuses: `draft`, `published`, `needs_fix`,
  `archived`.
- Do not require mandatory two-person review for v1.
- Bulk import exercises from spreadsheet/CSV/JSON.
- Import preview with row-level errors.
- Publish only valid rows.

Permissions:

- `content:read`
- `content:write`
- `content:publish`
- `quiz:validate`
- `exam:publish`

### 6.2 Learning Ops / Admin

Tools:

- Quiz attempt search.
- XP transaction audit.
- User mastery view.
- Mistake notebook support view.
- Leaderboard admin view.
- Badge definitions.
- XP reversal/adjustment workflow.

Permissions:

- `learning:read`
- `xp:read`
- `xp:adjust`
- `audit:read`

Acceptance tests:

- Content writer cannot publish without permission.
- XP adjustment requires `xp:adjust`.
- Every admin mutation writes audit log.

## Recommended Build Order

### Sprint 1: Model And Contract Hardening

- Write XP economy doc.
- Add question validation service.
- Add quiz version/snapshot design.
- Add exercise bank model decision.
- Add missing tests around current Exam Bank API and quiz submission.

### Sprint 2: Official Quiz Engine

- Centralize all official quiz submission paths.
- Ensure all official routes use `persist_quiz_submission`.
- Add per-question safe result payload.
- Add renderer support for all official question types.
- Add contract tests between backend quiz payload and frontend renderer.

### Sprint 3: Exam Bank V1

- Improve Exam Bank API filters.
- Add problem detail endpoint/page.
- Add progress/activity tracking for opened/attempted/completed/saved.
- Add locked-state redaction tests.
- Add student UI for exam browsing and problem solving.

### Sprint 4: Exercise Bank V1

- Add exercise bank browsing API.
- Add exercise detail/read/reveal/self-grade flow.
- Add correction display.
- Add bank-local filters for `again`, `partial`, `mastered`, saved, and
  retry-later. Do not build a unified Revision Queue in v1.

### Sprint 5: XP And Mistake Notebook

- Add mistake notebook tables/services.
- Add user concept mastery table/service.
- Add XP caps and reversals.
- Add quest expansions.
- Add XP audit views.

### Sprint 6: Leaderboards And Badges

- Add seasons.
- Add badge definitions/user badges.
- Add leaderboard projections by season/subject.
- Add frontend badge/season UI.

### Sprint 7: Backoffice

- Add content tools for exams/questions/exercises.
- Add import/validation.
- Add XP audit/adjustment.
- Add content quality queues.

### Sprint 8: Security, Performance, And Test Freeze

- Authorization tests for all new endpoints.
- Rate limit submissions and XP-affecting writes.
- Query-count/performance tests for bank browsing.
- Load test quiz submit and exam bank filters.
- Run final focused regression suite.

## Focused 10-Day Test Plan

Day 1: data and migrations

- Alembic upgrade.
- Seed/import representative exams, exercises, questions.
- Validate data integrity.

Day 2: quiz correctness

- Every question type.
- Backend grading.
- Duplicate submits.
- Old quiz version attempts.

Day 3: exam bank

- Filters.
- Problem detail.
- Locked access.
- Video/written solution visibility.
- Attempt/completion state.

Day 4: exercise/question bank

- Browsing.
- Attempt flow.
- Corrections.
- Bank-local revision filters.
- Saves/deep links.

Day 5: XP

- Award rules.
- Idempotency.
- Caps.
- Reversals.
- History totals.

Day 6: mastery and mistake notebook

- Wrong answer entries.
- Concept mastery changes.
- Review queue.
- Deep links.

Day 7: leaderboards, quests, badges

- Daily quests.
- Seasons.
- Badge idempotency.
- Projection refresh.

Day 8: backoffice

- Content creation.
- Validation.
- Publish.
- XP adjustment.
- Audit logs.

Day 9: security and abuse

- Cross-user attempts.
- Forged score/pass.
- Unauthorized bank access.
- Rate limits.
- Admin permission checks.

Day 10: performance and release decision

- Exam bank filter p95.
- Quiz submit p95.
- Leaderboard projection timing.
- Query count checks.
- Final focused sign-off.

## Definition Of Done

This focused roadmap is complete when:

- Exam Bank supports full exams and problem-level study with filters and access
  gates.
- Exercise Bank supports written-first self-study practice with correction
  reveal, self-grading, revision filters, and capped motivational XP.
- One backend quiz engine grades and persists official quiz attempts.
- XP is idempotent, capped, auditable, and connected to real learning actions.
- Mistake Notebook and mastery are fed by official verified quiz attempts in
  v1; Exercise and Exam Bank revision remain bank-local filters.
- Leaderboards, quests, and badges are projection-based and not easy to farm.
- Backoffice can create, validate, publish, audit, and correct this content
  without raw SQLAdmin.
