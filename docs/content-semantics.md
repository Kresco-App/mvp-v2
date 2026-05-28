# Current Content Semantics

This file is the current semantic contract for Kresco content. It intentionally mirrors the latest implementation and avoids historical planning notes.

## Canonical Hierarchy

```text
Subject
-> Topic
-> TopicSection
-> TopicItem
-> TabContent
```

Related records:

- `Resource`: reusable video, PDF, worksheet, summary, external content, or provider-backed asset.
- `ConceptTag`: semantic tag used by search, analytics, quiz diagnosis, and content organization.
- `QuestionSet`: normalized quiz-level object.
- `Question`: normalized question row with flexible rendering and answer JSON.
- `QuizAttempt`: one submitted quiz session.
- `QuestionAttempt`: one submitted answer within a quiz attempt.
- `TopicItemProgress`: per-user progress for a learning path item.
- `ActivityEvent`: append-only interaction/event log.
- `XPTransaction`: auditable XP award row.

## Workspace Semantics

The Topic Workspace has one guided route: Main Path.

Current path sections:

```text
Lessons
Exercises
Bac Examples
Synthese et Revision
```

The final revision section is a normal `TopicSection` at the end of the topic. It should contain normal `TopicItem` rows that resurface summary video, animated courses, labs, quizzes, notes, and resources through references instead of duplicated content.

## Topic Items

A `TopicItem` is the selectable unit in the workspace rail.

Current item types include:

- `lesson_video`
- `checkpoint_quiz`
- `exercise_solution_video`
- `practice_set`
- `bac_example`
- `interactive_lesson`
- `lab`
- `resource_collection`
- `quiz_collection`

The primary viewer can render video, quiz, animated content, lab/simulator, exam content, or resource preview depending on item type and renderer key.

## Tabs

`TabContent` belongs under a `TopicItem`. Tabs are configurable data, not hard-coded curriculum hierarchy.

Current tab slots:

- Course
- Lab
- Quiz
- Summary
- Resources
- Notes

Notes should be available for every learning path item. If a seeded notes tab is missing, the UI can still render a notes surface against the current item.

## Quizzes

Current quiz source data may originate in `TabContent.config_json`, but runtime tracking uses normalized records:

```text
QuestionSet
-> Question
-> QuizAttempt
-> QuestionAttempt
```

Required question types:

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
- `numeric_approximation`
- `slider_estimation`
- `exact_match`
- `formula_builder`
- `error_spotting`
- `image_hotspot`

Each `QuestionAttempt` stores selected answer JSON, correct answer JSON, correctness, score, grading metadata, timing, and hierarchy context.

## Progress And XP

Progress and XP are separate.

Progress answers what the student has completed inside a topic. XP answers what verified study activity has been awarded platform-wide.

Current tracking rows:

- `TopicItemProgress` tracks status, watched seconds, latest score, best score, and completion timestamp.
- `ActivityEvent` stores interaction history.
- `QuizAttempt` and `QuestionAttempt` store quiz-level and question-level results.
- `XPTransaction` stores every XP award with context fields and idempotency keys.

XP awards should be idempotent for first-correct and first-pass style rewards.

## Access

Access is evaluated at topic, item, tab, resource, exam, and problem surfaces.

Current gate fields:

- `is_free_preview`
- `required_tier`
- `required_feature_key`

Locked API responses must strip protected provider IDs, URLs, answer configs, and written solutions.

## Search

Topic search is scoped to the active topic.

It should search:

- TopicItems
- Tabs
- Resources
- Notes
- Concept tags
- Difficulty metadata
- Bac examples

Global search is not part of the current implementation contract.
