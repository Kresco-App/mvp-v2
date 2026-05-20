# Topic Workspace UX

## Current Core Idea

The Topic Workspace is the main learning room. A student enters a topic, resumes the active item, and works through one guided Main Path rail.

Current backend endpoint:

```text
GET /api/courses/topics/{topic_id}/workspace
```

Current frontend route:

```text
/topics/[topicId]
```

## Current Layout

Desktop layout:

```text
Header / breadcrumb / topic progress / search
Primary viewer
Tabs / secondary viewer
Right control room with section rail
```

The primary viewer can show:

- Video.
- Quiz.
- Animated lesson.
- Lab/simulator.
- Exam problem.
- Resource preview.

## Current Path Structure

The control room has one guided route: Main Path.

Current sections:

- Lessons.
- Exercises.
- Bac Examples.
- Synthese et Revision.

The final revision section contains normal TopicItems for:

- Summary video.
- Animated course collection.
- Lab collection.
- Quiz collection.
- Resource collection.
- Notes.

## Current Navigation

Next/previous movement follows path items, not every tab.

Tabs are related content for the selected item.

Current guidance surfaces:

- Checkmarks.
- Recommended labels.
- Soft reminders.
- XP.
- Progress credit.
- Completion indicators.

## Current Tabs

Tabs are editable/configurable data through `TabContent`.

Current tab types:

- `course`
- `interactive`
- `lab`
- `quiz`
- `summary`
- `resources`
- `notes`
- `exam_problem`

Tabs can render:

- Rich text.
- PDF/download.
- React component registry key.
- Quiz.
- Resource list.
- Notes component.

## Current Search

Topic search is scoped to the active topic.

Search covers:

- Lesson videos.
- Exercise videos.
- Quizzes.
- Labs.
- Summaries.
- Resources.
- Notes.
- Bac Examples.
- Concept tags.
- Difficulty tags.
- Tab content where indexed.

## Current Locked Preview Behavior

Locked preview keeps the learning structure visible while protected content is stripped.

Locked preview should show:

- Short summary.
- What the student will learn.
- Available free preview state.
- Locked items.
- Upgrade or unlock CTA.

## Current Usability Requirements

The workspace must support:

- Continue where I stopped.
- Watch the next lesson.
- Practice quizzes in this topic.
- Open interactive labs.
- Download resources.
- Review notes.
- Retry weak quizzes.
- Search for a concept inside this topic.
- Jump from a saved item back into the exact workspace context.
