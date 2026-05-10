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
- Future AI, live tutoring, chat, and forum.

Do not design v1 around all school levels. Keep the model clean enough to expand, but optimize content and UX around Bac.

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
- `ConceptTag`: Semantic tag used for search, filtering, recommendations, AI context, retry recommendations, and analytics.

## Removed/changed vocabulary

Avoid treating `Unit` as a required level. The user explicitly rejected `unit` as a semantic layer for this product.

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

Study Tools are secondary aggregations:

- Quizzes.
- Interactive.
- Resources.
- Notes.

Study Tools should not replace the Main Path. They help the student access all quizzes, labs, resources, or notes directly.

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
- A standalone Study Tool item.

Use stable registry keys for complex React content, for example:

- `wave_simulator`
- `periodicite_interactive_course`
- `continuity_graph_lab`

The database should attach registered components to topics/items/tabs without requiring every interactive object to be fully editable through admin at v1.

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

Store attempts with:

- First attempt.
- Latest attempt.
- Best attempt.
- Completion status.
- Score.
- Time spent where meaningful.

The first attempt matters for XP, diagnosis, recommendations, and anti-farming.

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
- AI context later.
- Analytics.
- XP balancing.
