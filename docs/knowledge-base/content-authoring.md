# Content Authoring

## Purpose

Use this guide when adding or modifying Kresco learning content.

There are two knowledge-base layers:

- Project knowledge base: Markdown files in `docs/knowledge-base/`.
- App knowledge base: database content shown to students, managed through Subjects, Topics, TopicSections, TopicItems, Resources, TabContent, ConceptTags, Exams, and ExamProblems.

Do not mix the two. Product decisions and implementation rules belong in Markdown. Student-facing lessons, quizzes, videos, resources, and exam problems belong in the app database or seed scripts.

## App content hierarchy

The canonical student-facing hierarchy is:

```text
Subject
-> Topic
-> TopicSection
-> TopicItem
-> TabContent
```

Related records:

- `Resource`: reusable video, PDF, summary, worksheet, or external content.
- `ConceptTag`: semantic label for search, analytics, recommendations, and XP balancing.
- `Exam` and `ExamProblem`: Bac exam bank content linked back to topics where possible.

## Safe edit paths

Use SQLAdmin for small manual edits:

- Rename a subject, topic, section, item, tab, or resource.
- Reorder content with the `order` field.
- Publish, hide, archive, or draft records with `status` where available.
- Update copy, tab content, quiz JSON, provider IDs, access gates, or free-preview flags.

Use seed scripts for repeatable content changes:

- Add a new launch topic.
- Rebuild a complete topic path.
- Add default tabs, quizzes, resources, exam examples, and concept tags together.
- Keep local validation data reproducible across machines.

Current seed entry points:

- `backend/seed_kresco_v1.py`: lightweight local Bac starter content.
- `backend/seed_burner_data.py`: richer demo/workspace content with progress surfaces.

Both scripts are local-only and require `KRESCO_CONFIRM_DESTRUCTIVE_SEED` for CLI runs because they replace local content surfaces.

## Adding a new topic

Create or update these records together:

1. `Subject`: ensure the target subject exists and is published.
2. `Topic`: set `subject_id`, stable `slug`, title, description, `status`, `order`, access gates, and preview flag.
3. `ConceptTag`: create tags for the core concepts, then attach slugs to items, tabs, questions, resources, and exam problems.
4. `Resource`: create primary video, summary sheet, worksheet, and correction video records when available.
5. `TopicSection`: default sections are Lessons, Exercises, and Bac Examples. Homework can be added when the topic needs a separate practice lane.
6. `TopicItem`: create the main path items such as lesson video, checkpoint quiz, guided exercise, practice set, and Bac example.
7. `TabContent`: add the tabs students need for each item. Lesson defaults are Course, Lab or Animated Course, Quiz, Summary, Resources, and Notes.
8. `Exam` and `ExamProblem`: attach at least one topic-relevant Bac-style problem when available.
9. Final revision section: add a final section such as `Synthese et Revision` that references the topic's summary video, animated courses, labs, quizzes, and resources instead of relying on a separate tools mode.

## Required field conventions

Use stable lowercase slugs for machine-facing keys:

- Topic slug: `<subject>-<topic>`, for example `physics-ondes-mecaniques-periodiques`.
- Concept slug: short normalized phrase, for example `periodicite` or `relation-v-lambda-f`.
- Renderer key: stable React registry key, for example `wave_simulator` or `continuity_graph_lab`.

Use these status values unless a model explicitly documents otherwise:

- `draft`
- `published`
- `hidden`
- `archived`

Use these default section types:

- `lessons`
- `exercises`
- `homework`
- `bac_examples`

Use these common item types:

- `lesson_video`
- `checkpoint_quiz`
- `exercise_solution_video`
- `practice_set`
- `bac_example`
- `interactive_lesson`

Use these common tab types:

- `course`
- `interactive`
- `lab`
- `quiz`
- `summary`
- `resources`
- `notes`
- `exam_problem`

## Quiz JSON shape

For MVP quiz tabs, `TabContent.config_json` can still provide source data:

```json
{
  "pass_score": 70,
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "prompt": "Question text",
      "options": ["A", "B", "C"],
      "answer": "A"
    }
  ]
}
```

Supported starter question types:

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

At runtime, quiz tab data is materialized into normalized records:

```text
QuestionSet
-> Question
-> QuestionAttempt
```

Do not create duplicate quiz content for revision sections. The final quiz
collection should reference existing QuestionSets or quiz tabs.

## Access and preview rules

Set access gates as close to the content they affect as possible:

- `is_free_preview=true` for content visible before payment or entitlement.
- `required_tier` for plan-level gates.
- `required_feature_key` for feature-specific gates.

Child records can inherit practical access from the topic, but explicit gates on TopicItems, TabContent, Resources, Exams, and ExamProblems make admin review easier.

## Review checklist

Before considering a content change complete:

- The topic appears in `/api/topics` for the intended subject.
- The workspace loads through `/api/topics/{topic_id}/workspace`.
- Every published TopicItem has at least one visible tab.
- Notes are available for each learning path item.
- Quiz tabs include `pass_score` and unique question IDs.
- Concept slugs are attached consistently to items, tabs, quizzes, and exam problems.
- Locked content removes provider IDs, URLs, solutions, or config from API responses.
- Local seed scripts can be rerun without duplicating the same topic.
