# Notes, Saves, and Profile Hub

## Current Notes Model

Notes are attached to the current learning context.

Current note context fields:

- `subject_id`
- `topic_id`
- `topic_item_id`
- `tab_content_id`

Topic Workspace notes:

- Notes attach to the current TopicItem.
- Notes deep-link back to the source item.
- Notes are available through the Notes tab surface.

Final revision notes:

- The final revision section can include a notes item.
- The notes item groups notes for the current topic by source item.
- Selecting a note returns the student to the exact TopicItem context.

Profile notes:

- Profile shows notes across topics.
- Profile notes deep-link back to the original Topic Workspace context.

## Current Saves Model

Saved item targets:

- TopicItem.
- Resource.
- Quiz.
- Question.
- ExamProblem.
- TabContent.

Saved items store references and deep links. They do not duplicate content.

## Deep-Link Requirement

Every saved item and note should navigate back to:

```text
Subject -> Topic -> TopicItem -> Tab/resource context
```

If a content object cannot be deep-linked, it is not modeled cleanly enough.
