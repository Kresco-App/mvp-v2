# Exam Bank

## Role

The Exam Bank is a separate major workspace.

It is not only a tab inside Topic Workspace.

It aggregates Bac exam problems, statements, written solutions, and gradually video solutions.

## Topic Bac Examples

Inside a Topic Workspace, the Bac Examples section should contain only topic-relevant exam problems.

Example: in Light Waves, Bac Examples should show wave-related Bac problems, not full unrelated exams.

## Exam Bank scope

Exam Bank should support:

- Full exam statements.
- Problem-level browsing.
- Subject filters.
- Topic filters.
- Year filters.
- Concept tags.
- Difficulty tags.
- Written solution availability.
- Video solution availability.
- Completion/attempt/saved filters.

## Data entities

Suggested model:

```text
Exam
-> ExamProblem
-> WrittenSolution
-> VideoSolution

ExamProblem
-> ExamProblemTopicLink
-> ConceptTags
```

Video solutions should use the same `Resource` model as other videos where possible.

Written solutions v1 can be uploaded PDFs.

Future written solution formats can include:

- PDF.
- Image.
- Rich text.
- Markdown.

## Search

Exam Bank search is independent from Topic search.

Exam Bank search should search:

- Exam year.
- Subject.
- Topic.
- Problem title.
- Problem statement.
- Concept tags.
- Difficulty tags.
- Solution metadata.

## Reuse

A video resource may be attached to:

- A TopicItem.
- An ExamProblem.
- A full Exam.

Keep this flexible. Time constraints may decide whether the team creates full-exam corrections, problem-level corrections, or topic-level corrections first.

## Access

Use the same policy-based access system as the rest of the product.

Possible gates:

- Subject access.
- Global tier.
- Feature key.
- Free preview.

Do not hard-code Exam Bank into one subscription assumption.
