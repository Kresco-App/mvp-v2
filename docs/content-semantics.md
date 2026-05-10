# Kresco Content Semantics

## Purpose

This document defines the agreed content model for Kresco's Bac-first learning experience.

It exists so product, design, backend, frontend, admin tooling, and future mobile work use the same vocabulary before implementation starts.

## Product Principle

Kresco is a video-first Bac learning platform, but the architecture must be item-type-first.

Meaning:

```text
Most student journeys start from videos.
The main viewer can still render a quiz, exercise, interactive course, resource, or simulated exam when that is the selected item.
```

The product should not be locked into "everything is a video."

The agreed sentence:

```text
A topic is a video-first study workspace with a guided item sequence and contextual tabs for course, labs, quizzes, summaries, resources, and notes.
```

## Core Hierarchy

Use this hierarchy:

```text
Subject
-> Topic
-> Section
-> TopicItem
-> TabContent / Attachment
```

Supporting reusable entities:

```text
Resource
Question
Exam
InteractiveComponent
Progress
UserNote
ConceptTag
```

## Subject

A subject is the school subject the student buys or studies.

Examples:

```text
Mathematiques
Physique
Chimie
SVT
Philosophie
Anglais
```

Subject is the highest access category.

Examples:

```text
User has Math access.
User has Physics access.
User does not have Biology access.
```

## Topic

A topic is a major Bac curriculum concept inside a subject.

Examples in Physics:

```text
Ondes mecaniques progressives
Ondes mecaniques periodiques
Propagation de la lumiere
Electricite
Radioactivite
Mecanique de Newton
```

Examples in Math:

```text
Limites et continuite
Derivabilite et etude des fonctions
Suites numeriques
Nombres complexes
Probabilites
Integrales
```

Rule:

```text
If a Bac student would say "I need to revise X", X is probably a Topic.
```

When a student opens a topic, the app opens a Topic Workspace.

## Topic Workspace

The Topic Workspace is the main study screen for one topic.

It has three conceptual areas:

```text
Navigation / control room
Primary viewer
Secondary viewer / tabs
```

Navigation chooses the active TopicItem.

Primary viewer renders the active TopicItem.

Secondary viewer renders contextual tabs and attachments for that TopicItem.

The UI can change later without changing the content model.

Decision:

Topics should open directly into the Topic Workspace/player, not a separate welcome page.

Use a compact topic header instead:

```text
subject breadcrumb
topic title
progress
Path / Tools switch
topic search/filter
```

Mobile layout is intentionally deferred to design.

The content model should remain responsive-friendly, but v1 product architecture decisions should not lock a specific mobile layout yet.

Desktop v1 layout decision:

```text
Primary viewer: left/center, dominant
Control room/navigation: right side
Secondary viewer/tabs: under the primary viewer
```

This matches the current Figma direction and keeps video/content visually dominant.

Future Arabic/RTL layouts may mirror placement, but v1 desktop implementation can lock this default.

Control room order:

```text
Master topic progress
Path | Tools switch
Topic search/filter
Current Path section list or Tool list
```

The progress shown at the top should be master progress for the whole topic, not only the currently selected section.

## Master Progress And XP

Master progress and XP are related but not identical.

Master progress answers:

```text
How complete is this topic?
```

XP answers:

```text
How much meaningful study activity has this student done?
```

Decision:

Master topic progress should include everything meaningful, but weighted so optional/support content does not dominate.

Recommended weighting:

```text
Main Path TopicItems: 70-80%
Tabs / Tools / Attachments: 20-30%
```

Examples:

```text
Lessons
Exercises
Bac Examples
Quizzes
Interactive
Resources
Notes
```

XP should track granular activity across everything.

Examples:

```text
video_started
video_watched_80
quiz_first_submitted
quiz_retried
quiz_improved
lab_interacted
summary_opened
resource_downloaded
note_created
exam_submitted
topic_completed
subject_progressed
daily_streak
```

XP should have anti-abuse rules.

Examples:

```text
first attempt matters most
repeating the same easy action gives reduced XP
opening a resource gives small XP
quiz performance gives stronger XP
video watch requires time threshold
interactive XP requires actual interaction
```

Decision:

XP should primarily reward meaningful, verifiable study actions, not simple opening/clicking.

Examples:

```text
open video = no XP or tiny XP
watch meaningful threshold = real XP
open lab = tiny XP
interact with lab = real XP
open/download PDF = small XP
submit quiz = real XP
improve quiz score = bonus XP
submit simulated exam = real XP
```

Anti-farming measures should include:

```text
time thresholds
interaction thresholds
daily caps where needed
diminishing returns on repeated actions
first-attempt emphasis
duplicate event protection
server-side validation for important XP events
```

Storage decision:

Use event log plus aggregate rows.

Recommended entities:

```text
activity_events
xp_ledger
user_progress / progress_snapshots
```

Purpose:

```text
activity_events = history, analytics, anti-farming, recommendations
xp_ledger = auditable XP awards
user_progress = fast UI reads
```

Do not log noisy raw telemetry. Log meaningful study events.

Video/progress event decision:

Use optimistic UI for immediate feedback, then persist/validate important progress server-side.

V1 practical behavior:

```text
frontend/player sends watch progress events
UI updates optimistically
server stores max watched percent / watched seconds
server deduplicates XP awards
XP awarded only after meaningful threshold
```

Example:

```text
video_watched_80 XP can be awarded once per video
```

Later, add stronger validation if the video provider exposes reliable playback events or webhooks.

Leaderboard decision:

```text
Leaderboard ranking uses seasonal XP.
Profile/history keeps lifetime XP.
```

Seasons can be weekly or another configured cadence.

Lifetime XP shows long-term achievement. Seasonal XP powers competition and rewards.

Leaderboard scope:

```text
Global across everything.
```

Because users may have different subject access, XP balancing and anti-abuse rules are important.

Examples of possible navigation surfaces:

```text
sidebar
accordion
timeline
playlist
mobile drawer
searchable list
```

Examples of possible secondary surfaces:

```text
tabs under video
right panel
bottom sheet
accordion
fullscreen expansion
```

## Section

A section groups the main sequence of TopicItems inside a topic.

Sections are practical content buckets, not curriculum hierarchy.

Recommended v1 sections:

```text
Lessons
Exercises
Bac Examples
```

Optional later sections:

```text
Mock Exams
Live Sessions
```

Quizzes, labs, summaries, and resources should usually live as tabs or attachments unless they deserve their own position in the main sequence.

## Main Path And Study Tools

The Topic Workspace has two navigation modes:

```text
Main Path
Study Tools
```

Decision:

Main Path is the primary navigation and should be visually emphasized.

Study Tools are secondary revision/access tools. They should be easy to reach but should not compete with the main guided path.

Recommended UI:

```text
Path | Tools
```

Default selection:

```text
Path
```

Main Path answers:

```text
What should I study next?
```

Study Tools answers:

```text
I want to practice or review one type of thing across this topic.
```

### Main Path

Main Path uses the v1 sections:

```text
Lessons
Exercises
Bac Examples
```

Decision:

The third Main Path section label is:

```text
Bac Examples
```

These sections contain the guided sequence of TopicItems.

### Study Tools

Study Tools are aggregated topic-level views.

Recommended v1 Study Tools:

```text
Quizzes
Interactive
Resources
Notes
```

Decision:

Notes should be included in Study Tools from v1.

The topic-level Notes tool should show notes for the current topic, grouped by source TopicItem.

Example:

```text
Video 1 notes
Exercise 3 notes
Bac Example 2022 notes
```

Clicking a note should deep-link back to the source TopicItem with the Notes tab active.

Optional later tools:

```text
Bookmarks
Mistakes
Downloads
AI Tutor
Forum/Q&A
```

Study Tools do not duplicate content. They query and resurface the same resources/attachments already linked inside the topic.

Examples:

```text
Quizzes = all quizzes attached to lessons/exercises plus standalone quiz TopicItems.
Interactive = all interactive lessons/components linked to this topic.
Resources = all summaries, PDFs, worksheets, formula sheets, and downloads.
Notes = all user notes written inside this topic.
```

Decision:

The Resources Study Tool should be grouped primarily by resource type.

V1 important groups:

```text
Summaries
Worksheets
PDFs / Downloads
```

Optional later groups:

```text
Formula Sheets
Corrections
Transcripts
```

Filtering by source section can be added later if needed, but type grouping is the priority.

Decision:

The Interactive Study Tool should show two clear groups:

```text
Interactive Courses
Labs / Simulators
```

Interactive Courses are full learning pages.

Labs / Simulators are reusable interactive components.

Example:

```text
Interactive Courses:
- Periodicite
- Continuity Graphs

Labs / Simulators:
- Wave Simulator
- Function Graph Lab
```

This solves two workflows at once:

```text
Main Path = guided study flow.
Study Tools = targeted revision and review.
```

## TopicItem

A TopicItem is the selectable item in the topic's main sequence.

It answers:

```text
What did the student select?
What should the primary viewer render?
```

Examples:

```text
lesson_video
exercise_solution_video
bac_example_video
checkpoint_quiz
interactive_lesson
simulated_exam
resource_viewer
live_session
```

TopicItems appear in sections and have an order.

Admins/content editors can reorder TopicItems manually inside sections.

Use explicit order indexes per section.

TopicItems should support draft/published states so content can be prepared before release.

Example:

```text
Subject: Physique
Topic: Ondes mecaniques periodiques
Section: Lessons

TopicItems:
1. Video - Introduction a la periodicite
2. Video - Periodicite temporelle
3. Quiz - Checkpoint periodicite
4. Video - Periodicite spatiale
```

Rule:

```text
If students should intentionally select it as a step in the main flow, it is a TopicItem.
```

TopicItems can render from a primary Resource or from structured data/reference.

Examples:

```text
video item -> primary_resource = video
quiz item -> quiz resource/config
interactive lesson -> renderer_key / structured blocks
exam problem -> exam_problem_id
```

`primary_resource` can be nullable when the item points to a structured entity.

## TabContent

TabContent is contextual material shown around the selected TopicItem, usually in the secondary viewer.

Examples under a lesson video:

```text
Course
Lab
Quiz
Summary
Resources
Notes
```

Tabs are configurable per TopicItem.

Not every item needs every tab.

The system should support default tab templates by item type, while allowing admins/content editors to enable, disable, reorder, and attach tab content per item.

Example default for a lesson video:

```text
Course
Lab
Quiz
Summary
Resources
Notes
```

Example actual item:

```text
Video - Introduction aux ondes
Tabs:
- Course
- Summary
- Notes
```

Example actual item with richer support:

```text
Video - Periodicite temporelle
Tabs:
- Course
- Lab
- Quiz
- Summary
- Resources
- Notes
```

Decision:

Admins/content editors can reorder tabs per TopicItem.

Default priority:

```text
Course
Lab
Quiz
Summary
Resources
Notes
```

TabContent should support status states.

Recommended:

```text
draft
published
hidden
```

This allows a video to be published before its lab, quiz, or summary is ready.

Subject-specific tabs are allowed.

Examples:

```text
Formula
Definitions
Vocabulary
Key Words
Theorems
Methods
Mistakes
```

These should follow the same configurable tab model rather than requiring new hardcoded layout rules.

Tab display behavior:

Show important tabs directly when space allows.

Use `More` only for overflow or lower-priority subject-specific tabs.

Default visible priority:

```text
Course
Lab
Quiz
Summary
Resources
Notes
```

Overflow examples:

```text
Formula
Definitions
Vocabulary
Methods
Mistakes
```

Examples under an exercise video:

```text
Statement
Correction
Quiz
Resources
Notes
```

Examples under a Bac example:

```text
Problem
Correction
Concepts
Resources
Notes
```

TabContent can render from resources or structured components.

Examples:

```text
Course tab = structured animated course blocks
Lab tab = interactive component key
Quiz tab = quiz config/resource
Summary tab = rich text or PDF resource
Resources tab = list of resources
Notes tab = user notes component
```

Rule:

```text
If it supports the selected item, it is TabContent or an Attachment.
If it deserves its own step in the main sequence, it is a TopicItem.
```

## Attachment

An attachment connects reusable content to a TopicItem.

Examples:

```text
lesson video -> lab
lesson video -> mini quiz
lesson video -> summary PDF
exercise video -> statement
exercise video -> correction PDF
quiz -> related video
interactive lesson -> related summary
```

Attachments let the same content appear in multiple contexts without duplication.

Example:

```text
Wave Simulator
-> appears in the Interactive Course
-> appears under a relevant lesson video
-> appears in the Labs tab
-> appears after a quiz mistake
```

## Resource

A resource is a reusable asset.

Examples:

```text
video
pdf
summary
formula_sheet
worksheet
interactive_component
interactive_course
quiz
question_set
exam_file
image
transcript
```

Resources should not be trapped inside one screen.

They can be attached to TopicItems, surfaced in search, reused in exam correction, or shown in future AI context.

Decision:

Resources are reusable across multiple TopicItems and contexts.

Examples:

```text
same formula sheet attached to multiple videos/exercises
same summary shown under a video and in Study Tools -> Resources
same worksheet attached to a lesson and an exercise
```

## Concept Tags

ConceptTags are required from v1.

They support:

```text
topic search
recommendations
AI context
retry recommendations
question/exam linking
analytics
```

Examples:

```text
periodicite temporelle
periodicite spatiale
frequence
longueur d'onde
relation v = lambda f
continuite en un point
fonction definie par morceaux
```

ConceptTags can attach to:

```text
TopicItem
Resource
Question
Quiz
Exam problem
```

They can be manually added in v1.

Difficulty can be represented as tag-like metadata in v1.

Uses:

```text
filters
XP weighting
recommendations
retry suggestions
analytics
```

Example difficulty tags:

```text
direct
application
approfondissement
bac
hard
```

This keeps the model flexible while still allowing difficulty-aware UX and XP rules.

## Exam Bank And Bac Examples

Bac Examples should exist both inside topic paths and inside a separate Exam Bank workspace.

Topic path usage:

```text
Topic -> Bac Examples section -> selected exam problems/correction videos for that topic
```

Decision:

Topic Workspace -> Bac Examples should show only topic-relevant exam problems.

Full exam corrections belong in the Exam Bank, not in a topic's Bac Examples section.

Bac Examples should not mix unrelated checkpoint/practice items as main items.

Each Bac Example can still have contextual tabs such as:

```text
Problem
Correction
Quiz
Concepts
Resources
Notes
```

Exam Bank usage:

```text
large aggregation of Bac exam statements across years/subjects
written solutions
optional video solutions added over time
filters/search
```

The same exam problem can appear:

```text
inside a Topic Workspace
inside the Exam Bank page
inside search results
inside recommendations
inside AI context later
```

Exam Bank should be a separate major page/workspace, not only a topic subview.

Recommended entities:

```text
Exam
ExamProblem
WrittenSolution
VideoSolution
ExamProblemTopicLink
```

Exam Bank access should stay policy-based and flexible.

Possible behavior:

```text
Exam Bank page visible to everyone
specific statements/solutions/video solutions gated by subject entitlement, tier, or feature key
```

The exact free/pro/VIP rules can be decided later without changing the model.

Exam Bank search is independent from Topic Workspace search.

Recommended filters:

```text
year
subject
topic
concept tags
difficulty
has written solution
has video solution
completed/attempted/saved
```

Written solutions should support multiple formats, but v1 can start with uploaded PDFs.

Supported model:

```text
pdf
image
rich_text
markdown
```

V1 default:

```text
uploaded PDF
```

Video solutions in Exam Bank should use the same video Resource model as normal course videos.

An ExamProblem can attach a video Resource as its solution.

This lets VdoCipher/token/player logic be reused.

Video reuse should stay flexible.

The same video Resource can be reused across Topic Workspace and Exam Bank when appropriate, but separate dedicated videos are also allowed.

Examples:

```text
ExamProblem video solution = one problem correction
Exam video solution = full exam correction
TopicItem Bac Example = topic-specific correction
```

VideoResource can attach to:

```text
TopicItem
ExamProblem
Exam
```

## AI Tutor

AI Tutor is future-supported, not v1 core scope.

When added, it should be context-aware.

Possible placements:

```text
Study Tools -> AI Tutor
Contextual tab: Ask AI
Inline help inside quiz/exercise/lab
```

Relevant context for AI:

```text
current subject
current topic
current TopicItem
visible screen/workspace
transcript/course tab
attached resources
concept tags
quiz attempts and mistakes
student notes if allowed
progress history
```

The goal is to context-engineer the AI tutor with what is actually relevant to the student's current screen and study state.

## Chat, Forum, And Q&A

Chat, forum, and teacher/student Q&A are separate features for now.

They should not be forced into the core Topic Workspace in v1.

Future linking should be supported:

```text
forum post linked to Topic
forum post linked to TopicItem
question linked to video timestamp
chat thread linked to subject/topic
teacher answer linked back to a resource or exercise
```

Main access can live elsewhere:

```text
dashboard
chat page
forum/community page
notification center
```

The Topic Workspace can later show contextual entry points such as "Ask about this video" or "View related discussion."

## Live Sessions And Recorded Lives

Live sessions are separate by default.

They should not be forced into the normal Main Path in v1.

Future linking should be supported:

```text
live session linked to Subject
live session linked to Topic
recorded live linked to Topic
recorded live linked to relevant TopicItems or ConceptTags
```

A topic can later expose an additional area for:

```text
upcoming related lives
previous recorded lives
VIP tutoring replays
```

This should behave like an extra contextual collection, not a required part of the normal topic path unless explicitly configured.

Decision:

Recorded Lives can become a future optional Study Tool.

Not part of v1 default tools unless the content exists.

Possible future tools:

```text
Quizzes
Interactive
Resources
Notes
Recorded Lives
```

## Interactive Lesson And Interactive Component

An InteractiveLesson is a full React-based course experience.

It may contain:

```text
structured explanation
definition blocks
formula blocks
concept cards
interactive components
mini questions
visual simulations
```

An InteractiveComponent is a reusable simulator/widget inside an InteractiveLesson or a tab.

Example:

```text
InteractiveLesson: Periodicite
InteractiveComponent: WaveSimulator
```

The same component can be used:

```text
inside a full interactive lesson
under a video
inside an exercise correction
inside a quiz explanation
as a standalone lab
```

## Quiz

Quizzes have two placements.

Inline quiz:

```text
shown as a tab under a video or exercise
small checkpoint
supports the current item
```

Standalone quiz:

```text
shown as a TopicItem
appears in the main sequence
has its own primary viewer
```

Rule:

```text
Small support quiz = TabContent.
Important checkpoint quiz = TopicItem.
```

Quiz attempts should support multiple submissions.

Decision:

Store first, latest, and best attempt information.

Why:

```text
first attempt = XP, baseline understanding, honest diagnostic signal
latest attempt = current state
best attempt = achievement/progress display
```

Recommended attempt fields:

```text
quiz_id
user_id
attempt_number
answers
score
submitted_at
duration_seconds
source_topic_item_id
```

Completion rule:

```text
Quiz is completed once at least one attempt is submitted.
```

Students should be able to retry quizzes from contextual tabs or from Study Tools -> Quizzes.

Study Tools -> Quizzes should be grouped by learning status.

V1 groups:

```text
All
Uncompleted
Completed
Retry Recommended
```

Each quiz row should show useful metadata:

```text
source item
score
first attempt
best attempt
difficulty
```

## Notes

Notes are contextual to the current TopicItem.

Examples:

```text
notes for this video
notes for this exercise
notes for this Bac example
```

Later, notes can be aggregated into a "My Notes" page.

Decision:

Notes should always be available as a tab for every TopicItem, even if no custom content tabs exist.

Notes are user-generated, not content-generated.

Future notes direction:

```text
Per-TopicItem notes
Aggregated topic notes
Global My Notes page
Deep links from aggregated notes back to the source TopicItem
Optional canvas-style notes
```

Decision:

Notes should exist in both places:

```text
Study Tools -> Notes = notes for the current topic
Profile -> Notes = all notes across all topics
```

Every aggregated note should deep-link back to its source TopicItem/tab.

Canvas-style notes could later use a lightweight drawing/canvas system or an Excalidraw-style open source approach. This should be treated as a future enhancement, not a v1 blocker.

## Saves And Bookmarks

Students should be able to save content from v1.

Supported save targets:

```text
TopicItem
Resource
Quiz
Question
ExamProblem
TabContent
```

Possible later target:

```text
video timestamp bookmark
```

There should be a centralized saved hub where students can see all saved items and jump directly back to the exact content location.

Decision:

The saved hub should live under Profile.

An optional dashboard shortcut can be added later.

Profile should act as a personal learning hub.

Recommended sections:

```text
Overview
Saved
Notes
Achievements
Settings
```

Account settings should be visually separate from learning data.

Deep-link examples:

```text
Saved lesson video -> opens Topic Workspace with that TopicItem selected
Saved PDF summary -> opens Topic Workspace with source item selected and Resources/Summary tab active
Saved quiz -> opens Topic Workspace with source item selected and Quiz tab active, or standalone quiz item selected
Saved exam problem -> opens Exam Bank or Topic Workspace depending on source
```

This hub should not duplicate content. It should store saved references and route back to the original content.

## Dashboard/Home

The dashboard follows the clean overview direction in Figma.

Role:

```text
overview
continuation
subjects
progress widgets
```

The dashboard answers:

```text
Where am I?
What should I continue?
How am I doing?
What can I open next?
```

Recommended priorities:

```text
Continue studying / recent activity
My subjects or available subjects
Progress summary
Streak / weekly activity
Upcoming or relevant events later
Leaderboard snapshot
```

The dashboard should not replace the Topic Workspace.

## Courses Browsing

The Courses page should show topic/course cards directly.

Behavior:

```text
Click Courses -> card grid
Dashboard shortcut -> Courses with prefilled filter/search
```

Search/filter should be semantic and tag-aware.

Examples:

```text
subject filter
topic search
concept tags
difficulty tags
status/progress
locked/unlocked
```

Topic cards should show:

```text
subject
topic title
progress
locked/unlocked status
continue/open action
```

Courses should show both unlocked and locked content, with clear status.

Recommended filters:

```text
All
Unlocked
Locked
In Progress
Completed
```

Clicking locked content should open a locked preview state, not a dead button.

Locked preview should show:

```text
topic title
what is inside
free preview if available
unlock CTA
reason locked
```

Locked preview should be lightweight.

Recommended:

```text
summary counts
free preview items if available
unlock CTA
```

Example:

```text
6 lessons
17 exercises
4 Bac examples
3 quizzes
2 resources
```

Avoid showing a noisy fully locked control room by default.

Free preview items should open inside the normal Topic Workspace.

Rules:

```text
preview item accessible
unavailable items/tabs/resources hidden or locked
upgrade CTA visible
locked indicators clear
```

## Progress

Progress should track the main flow first.

Recommended v1 section progress:

```text
Lessons: 3/6
Exercises: 7/17
Bac Examples: 1/4
```

Tabs can have optional sub-progress, but they should not clutter the main control room.

Examples:

```text
video watched
quiz submitted
summary opened
lab opened or completed
resource downloaded
notes written
```

Completion rules depend on item type:

```text
video = watched threshold or manually marked done
quiz = submitted
exercise = attempted, watched, or manually marked done
resource = opened/downloaded
interactive = opened or completed task
simulated_exam = submitted
notes = not required for completion
```

Decision:

V1 completion rules:

```text
Video TopicItem = watched 80% or manually marked done
Exercise video = watched 80% or manually marked done
Bac example = watched/attempted or manually marked done
Quiz = submitted
Interactive/Lab tab = opened or completed interaction
Summary/Resource = opened/downloaded
Notes = never required for completion
```

Interactive completion should be configurable.

Decision:

Default interactive completion mode:

```text
interacted
```

Supported modes:

```text
opened
interacted
task_completed
manual
```

Examples:

```text
Wave simulator = completed when interacted with
Interactive course page = completed when viewed/interacted with or manually marked done
Guided lab with questions = completed when task is submitted
```

Main section progress should count TopicItems, not every tab.

Tabs can show checkmarks, recommendations, and rewards, but skipped optional tabs should not make the main item permanently feel incomplete.

## Next Behavior And Tab Guidance

The `Next` action follows the Main Path.

```text
Current TopicItem -> next TopicItem in the active Path section/order
```

Tabs do not hijack `Next`.

Example:

```text
Current item: Lesson Video 2
Tabs: Course, Lab, Quiz, Summary, Resources, Notes
Click Next -> opens the next TopicItem
```

However, students should be guided and rewarded for engaging with useful tabs.

Recommended behavior:

```text
Show subtle completion indicators on tabs.
Highlight recommended tabs for the current item.
Reward tab interactions with XP/progress where appropriate.
Warn gently before skipping highly recommended tabs.
Never hard-block normal learning flow unless the item is explicitly gated.
```

Examples:

```text
Course tab read -> small checkmark
Lab opened -> small checkmark / XP
Mini quiz submitted -> stronger completion reward
Summary opened -> weak completion signal
Notes written -> personal productivity signal, not required
```

Recommended tab states:

```text
recommended
unseen
in_progress
completed
optional
```

This makes tabs visible and motivating without making the platform frustrating.

## Unlock And Gating Policy

Normal learning order should not be hard-gated in v1.

Decision:

```text
Normal topic flow = open
Paid/subscription access = enforced
Future learning gates = supported by policy fields, mostly unused in v1
```

The system should avoid hardcoding "everything is always open."

TopicItems should support future policies such as:

```text
open
recommended_order
requires_previous
requires_quiz_pass
requires_vip
requires_live_schedule
requires_admin_unlock
```

V1 should mostly use:

```text
open
```

This keeps revision flexible while allowing stronger guided paths later.

## Access Policy

Paid access should be policy-based, not hardcoded to fixed meanings of Pro or VIP.

Decision:

Use separate concepts:

```text
Subject entitlement = which subjects the user can access
Global tier = user's overall plan level
Feature gate = what a specific item/resource/feature requires
```

Access rules can apply to TopicItems, resources, tabs, tools, live sessions, AI features, and future features.

Recommended access rule fields:

```text
required_subject_access
required_tier
required_feature_key
is_free_preview
```

Example feature keys:

```text
live_sessions
ai_tutor
teacher_chat
interactive_course
simulated_exams
downloads
advanced_quizzes
```

This allows the product team to decide later what Basic, Pro, and VIP unlock without changing the content model.

## Search

Search should exist at multiple levels over time.

V1 priority:

```text
Topic search/filter inside the Topic Workspace.
```

It is scoped to the current topic only.

It can search:

```text
Path items
Study Tools content
tabs
attachments
resources
notes
concept tags
difficulty tags
```

It should not search across other topics.

Example:

```text
Search: frequence

Results:
- Video - Frequence et periode
- Lab - Wave simulator
- Quiz - Relation v = lambda f
- Exercise - Calculer la frequence
- Summary - Ondes periodiques
```

Later:

```text
Global search overlay from navbar
Advanced question/exam bank search
```

Global search should route into existing workspaces instead of requiring a separate search page.

Decision:

Global search is later, not v1.

V1 search surfaces:

```text
Courses page semantic/tag search
Topic Workspace scoped search
Exam Bank search
```

Example:

```text
Search result: Video - Frequence et periode
-> opens Topic Workspace with that TopicItem selected
```

## Default Topic Opening Behavior

When a student opens a topic, something should always be selected.

Selection order:

```text
1. Last active item in this topic
2. Next incomplete recommended item
3. First item in Lessons
4. Empty/coming-soon state if topic has no items
```

For a new student:

```text
Open topic -> first introductory lesson video selected
```

Decision:

For a brand-new student opening a topic for the first time, the default selected item is the first introductory video in the Lessons section.

For a returning student:

```text
Open topic -> resume last item and timestamp when possible
```

Decision:

Last active item always has priority for returning students.

Recommendations can still be shown as secondary prompts, but they should not override the student's last active location.

## Video Persistence

Video is the default anchor for many topics, but not mandatory.

Recommended UX:

```text
Video-first by default.
Primary viewer can switch to quiz, lab, interactive course, resource, or exam.
Video can stay accessible as an in-app mini-player when useful.
```

Persistent video should be contextual, not global across the whole app.

Good places:

```text
Lab
Resources
Notes
Exercise correction
```

Bad places:

```text
timed quiz
simulated exam
checkout
unrelated app pages
```

Native Picture-in-Picture can be an enhancement, but the reliable product pattern should be an in-app mini-player.

## Concrete Example: Physics Waves

```text
Subject: Physique
Topic: Ondes mecaniques periodiques
```

Sections:

```text
Lessons
Exercises
Bac Examples
```

Lessons:

```text
1. Video - Introduction aux ondes periodiques
2. Video - Periodicite temporelle
3. Quiz - Checkpoint periodicite
4. Video - Periodicite spatiale
5. Video - Relation v = lambda f
```

Decision:

The Lessons section is mostly teaching videos, but can include inline checkpoint quizzes and interactive lessons when useful.

Examples:

```text
teaching_video
checkpoint_quiz
interactive_lesson
```

Selected lesson video tabs:

```text
Course
Lab
Quiz
Summary
Resources
Notes
```

Attachments:

```text
Wave Simulator
Summary PDF
Mini quiz
Formula sheet
```

Exercises:

```text
1. Exercise video - Application directe 1
2. Exercise video - Calculer la frequence
3. Exercise video - Calculer la longueur d'onde
```

Decision:

The Exercises section can include both exercise solution videos and standalone exercise/question items.

V1 may mostly use exercise solution videos, but the model should support:

```text
exercise_solution_video
exercise_set
standalone_question
practice_item
```

Bac Examples:

```text
1. National Bac 2022 - Ondes
2. National Bac 2023 - Ondes
```

## Concrete Example: Math Continuity

```text
Subject: Mathematiques
Topic: Limites et continuite
```

Sections:

```text
Lessons
Exercises
Bac Examples
```

Lessons:

```text
1. Video - Notion de limite
2. Video - Continuite en un point
3. Interactive Course - Continuite graphique
4. Quiz - Checkpoint continuite
```

Selected video tabs:

```text
Course
Lab
Quiz
Summary
Resources
Notes
```

Exercises:

```text
1. Exercise video - Fonction definie par morceaux
2. Exercise video - Prolongement par continuite
```

Bac Examples:

```text
1. National Bac - Etude de fonction
```

## Data Model Direction

Store content as relationships, not as fixed UI layout.

Core tables/entities:

```text
subjects
topics
sections
topic_items
resources
topic_item_attachments
questions
exams
concept_tags
user_progress
user_notes
```

The database should store:

```text
what exists
what order it appears in
what the primary resource is
what related resources attach to it
preferred display hints
```

The frontend should decide:

```text
sidebar vs timeline
tabs vs drawer
inline vs fullscreen
desktop vs mobile layout
```

This protects the app from future redesigns.

Current implementation note:

The current backend content schema should be treated as scaffolding.

Refactor/evolve toward:

```text
Subject
Topic
Section
TopicItem
Resource
Attachment/TabContent
```

Migration direction:

```text
Subject stays.
Chapter becomes Topic or is replaced by Topic.
Lesson becomes TopicItem.
Add Section, Resource, Attachment/TabContent.
```

Launch infrastructure decisions:

```text
RDS Proxy before launch
Caching before launch
Event-driven XP/progress processing
Observability from v1
```

RDS Proxy is required before launch because Lambda can create database connection pressure.

Caching is required before launch for frequently read learning content and metadata.

Cache-friendly targets:

```text
Courses page cards
Topic Workspace content structure
Resources metadata
Exam Bank metadata
public/locked preview summaries
```

Event-driven processing should use the AWS/Lambda stack already in use.

Recommended flow:

```text
FastAPI Lambda
-> write activity_event
-> send queue message
-> worker Lambda
-> validate/deduplicate
-> write xp_ledger
-> update progress aggregates
-> update seasonal leaderboard aggregates
```

SQS is the natural AWS fit for this.

Observability should cover payments, video tokens, workers, quiz submissions, activity events, deploy failures, API errors, and background job failures.

## Admin And Content Creation

V1 admin/content tooling should support normal content creation and organization.

Admin should be able to create and manage:

```text
Subject
Topic
Section
TopicItem
Resource
Attachment/Tab
Quiz
Question
Exam/Bac Example
```

For TopicItems, admin should be able to:

```text
choose type
set title/description
assign section
set order
attach primary resource
configure tabs
attach resources/quizzes/labs/summaries
set access policy
set completion policy
publish/unpublish
```

Decision:

Simple/standard content should be managed through admin.

Examples:

```text
videos
quizzes
downloadable resources
summaries
question sets
Bac examples
```

Harder structured animated courses and custom React interactive components can be created programmatically at first.

They should be registered in code with stable keys, then made attachable from the admin/UI.

Example:

```text
component_key: wave_simulator
component_key: periodicite_interactive_course
component_key: continuity_graph_lab
```

This avoids forcing non-technical admins to build complex React lessons inside the admin in v1.

Content creation decision:

Use a seed-first content workflow for most initial content.

Seed/import first:

```text
subjects
topics
sections
TopicItems
videos
PDFs
resources
Exam Bank metadata
initial attachments/tabs
```

Then reorganize and edit later through admin tooling.

Quizzes may also be created programmatically/seeded at first.

Quiz system must support multiple quiz/activity types, not only QCM/multiple choice.

Examples:

```text
multiple_choice
true_false
fill_in_blank
matching
ordering
drag_and_drop
short_answer
numeric_answer
multi_select
interactive_checkpoint
```

## Implementation Operating Rules

Pilot/starter content can be assembled from existing local data, reliable public Bac resources, and generated starter examples.

Initial content focus:

```text
Physics
Math
```

Real VdoCipher IDs may not be cleanly available at first.

The content model should support provider IDs properly, while seed data can use placeholders until real mappings are ready.

Interactive components should be placed through a stable registry/key system.

Examples:

```text
wave_simulator
periodicite_interactive_course
continuity_graph_lab
```

If exact component mappings are not ready, use placeholders or existing local components while preserving the registry contract.

Admin/content workflow:

```text
seed most content programmatically
provide light editing/reordering/publish controls
use UI/admin for content that cannot be cleanly seeded
```

Design rule:

Figma is the visual/design-system source of truth.

Follow it closely unless a design-level architectural assumption conflicts with the agreed content architecture.

Testing/browser feedback is required during implementation.

Caching rule:

```text
do not implement caching right now
design APIs to be cache-friendly
add caching before launch
```

## Final Naming

Use:

```text
Subject
Topic
Section
TopicItem
Resource
Attachment
Question
Exam
InteractiveLesson
InteractiveComponent
ConceptTag
Progress
UserNote
```

Avoid:

```text
Unit
Module
Lesson as a generic container
Video as the only content primitive
Hardcoding UI layout into the database
```
