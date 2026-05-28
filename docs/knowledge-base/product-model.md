# Product Model

## Product focus

Kresco v1 is for Bac students first.

The main promise is:

- Video courses.
- Full exam preparation.
- Quizzes and question practice.
- Solved exercises with videos.
- Bac exam examples.
- Downloadable summaries and worksheets.
- Interactive/animated React learning components.

Do not design v1 around all school levels. Optimize content and UX around Bac.

## Core hierarchy

Use this model as the baseline:

```text
Subject
-> Topic
-> Section
-> TopicItem
-> TabContent / Attachments / Resources
```

Definitions:

- `Subject`: Physics, Math, etc.
- `Topic`: A meaningful Bac curriculum topic such as Light Waves, Periodicity, Derivatives, Continuity.
- `Section`: A grouping inside a topic, usually Lessons, Exercises, Bac Examples.
- `TopicItem`: A learning item in the main path. It can be video, quiz, exercise, exam problem, interactive lesson, or other renderable item.
- `Resource`: Reusable content object such as video, PDF, summary, quiz, question set, simulation, or written solution.
- `TabContent`: Configurable content shown under a TopicItem.
- `ConceptTag`: Semantic tag used for search, filtering, retry recommendations, analytics, and XP balancing.

## Removed/changed vocabulary

Do not treat `Unit` as a required level. The user rejected `unit` as a semantic layer for this product.

Old terms like chapter/lesson can exist in UI copy or migration code, but the target product language should be Topic and TopicItem.

## Video-first, item-type-flexible

The UX is video-first because most current content is video.

The architecture must not be video-only.

A TopicItem can render:

- Lesson video.
- Exercise solution video.
- Quiz.
- Interactive course.
- Interactive lab.
- Bac exam problem.
- Downloadable resource.
- Structured content page.

`primary_resource_id` may be nullable when the TopicItem is backed by structured data or a registered React component.

## Sections

Default Topic sections:

- Lessons.
- Exercises.
- Bac Examples.

These are the Main Path.

Revision and review content lives in a final revision section inside the same guided path.

The final revision section can include:

- Summary video.
- Animated course collection.
- Lab collection.
- Quiz collection.
- Resource collection.

These final-section items should reference existing TopicItems, TabContent,
QuestionSets, and Resources instead of duplicating content.

## Tabs

Tabs are configurable per TopicItem.

Default lesson tabs may include:

- Course.
- Lab.
- Quiz.
- Summary.
- Resources.
- Notes.

Notes should always be available.

Other possible subject-specific tabs:

- Formula.
- Definitions.
- Vocabulary.
- Key Words.
- Theorems.
- Methods.
- Common Mistakes.

Not every TopicItem needs every tab.

## Interactive content

Interactive content can be:

- A full structured animated React course.
- A focused simulator/lab.
- A checkpoint inside a video path.
- A final revision item.

Use stable registry keys for complex React content, for example:

- `wave_simulator`
- `periodicite_interactive_course`
- `continuity_graph_lab`

The database attaches registered components to topics/items/tabs through stable renderer keys.

## Quizzes

Quizzes are not only QCM.

Required quiz/question types:

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

Canonical v1 quiz content should use normalized question sets:

```text
QuestionSet
-> Question
```

`QuestionSet` is the quiz-level object. It can be attached to a subject, topic,
section, topic item, and tab.

`Question` stores shared fields such as type, title, prompt, explanation,
difficulty, concept slugs, order, and status.

Each question also stores:

- `config_json`: type-specific rendering data such as options, slider range,
  drag zones, formula tokens, image hotspot geometry, media, or lines.
- `answer_json`: canonical answer data used for grading.

This hybrid model keeps analytics normalized while preserving the flexible Figma
quiz primitives.

Store attempts with:

- First attempt.
- Latest attempt.
- Best attempt.
- Completion status.
- Score.
- Time spent where meaningful.
- One `QuestionAttempt` row per answered question.

The first attempt matters for XP, diagnosis, recommendations, and anti-farming.

`QuizAttempt` is the session/result row. `QuestionAttempt` stores each submitted
answer, correctness, grading metadata, timing, and hierarchy context.

## Concept tags

Concept tags are required in v1.

Attach them to:

- TopicItems.
- Resources.
- Questions.
- Quizzes.
- ExamProblems.
- TabContent where useful.

Difficulty should also be represented as tag-like metadata.

Tags power:

- Topic search.
- Exam Bank filters.
- Retry recommendations.
- Analytics.
- XP balancing.
