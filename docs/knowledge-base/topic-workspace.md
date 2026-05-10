# Topic Workspace UX

## Core idea

The Topic Workspace is the main learning room.

When a student clicks a topic such as Light Waves, they should not land on a passive table of contents. They should enter a workspace that resumes or starts the learning flow.

Default behavior:

- Returning student: open the last active item, including video timestamp if available.
- New topic: open the first introductory video in Lessons.

## Layout

Desktop v1 layout:

```text
Header / breadcrumb / topic progress / search

Primary viewer
Tabs / secondary viewer

Right control room
```

The primary viewer is dominant.

It can show:

- Video player.
- Quiz.
- Interactive lesson.
- Lab.
- Exam problem.
- Resource preview.

The secondary viewer/tabs usually live below the primary viewer.

The control room usually lives on the right and handles navigation, progress, Path/Tools, and current item list.

## Video behavior

Video is usually the focus, but it is not sacred.

For a normal lesson video, the video should stay primary and the lab/course/quiz/resources should appear below or through tabs.

For a pure quiz, interactive course, or exam problem, the primary viewer can become that thing.

Do not force labs to replace the video by default just because a Figma screen shows that state. That can exist as a mode, but the default lesson experience should keep the video accessible.

VdoCipher PiP reliability is not a product foundation. Treat PiP as a nice enhancement only if provider/browser support works well. The core UX should still work without PiP.

## Main Path and Study Tools

The control room has two modes:

- Main Path.
- Study Tools.

Main Path is visually emphasized and selected by default.

Main Path sections:

- Lessons.
- Exercises.
- Bac Examples.

Study Tools:

- Quizzes.
- Interactive.
- Resources.
- Notes.

The Path is the guided learning route. Tools are aggregations for targeted work.

## Navigation

Next/Previous should move through the Main Path, not through every tab.

Tabs are related material for the current item.

A student can jump freely unless a specific future feature requires gating. Avoid hard blocking normal flow.

Guidance should happen through:

- Checkmarks.
- Recommended labels.
- Soft reminders.
- XP.
- Progress credit.
- Completion indicators.

## Tabs under viewer

Tabs should be editable/configurable from data.

Possible tabs:

- Course transcript or structured animated course.
- Lab/simulator.
- Quiz/checkpoint.
- Summary.
- Resources.
- Notes.
- Formula.
- Definitions.
- Vocabulary.
- Methods.
- Mistakes.

Tabs can render:

- Rich text.
- PDF/download.
- React component registry key.
- Quiz.
- Resource list.
- Notes component.

Show important tabs directly. Use More only for overflow.

## Topic search

V1 search is topic-scoped.

Topic search should search:

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

Example search for `frequence` should find:

- Lesson video about frequency.
- Quiz attached to that video.
- Lab using frequency.
- Summary mentioning frequency.
- Exercise about frequency.

Global cross-platform search is later.

## Courses page and dashboard routing

Courses page should show cards directly when the user clicks Courses.

Dashboard shortcuts can open Courses with a prefilled filter or search.

Courses filters:

- All.
- Unlocked.
- Locked.
- In Progress.
- Completed.

Locked course/topic card click should show a lightweight preview, not a dead state.

## Locked/free preview behavior

Locked preview should show:

- Short summary.
- What the student will learn.
- Available free previews.
- Locked items.
- Upgrade/unlock CTA.

Free preview should open the normal Topic Workspace with locked indicators.

This makes the product understandable before purchase and avoids hiding the learning structure.

## Usability guardrails

The UX should support these student workflows:

- Continue where I stopped.
- Watch the next lesson.
- Practice all quizzes in this topic.
- Open only interactive labs.
- Download all resources.
- Review my notes.
- Retry weak quizzes.
- Search for a concept inside this topic.
- Jump from a saved item back into the exact workspace context.

If a layout cannot support these workflows, it is incomplete.
