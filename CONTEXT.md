# Kresco Learning Platform

Kresco is a Bac-focused learning platform. This glossary records the product language used for learning content, practice, quizzes, exams, and progress.

## Language

**Exercise Bank**:
A student-facing practice workspace separate from the quiz system, containing many practice exercises for a subject, topic, or lesson-equivalent area. Exercises are their own model and are surfaced through a dedicated exercise area/tab where students browse, filter, open details, read the written statement, and reveal the correction when ready.
_Avoid_: Question Bank, practice question bank

**Exercise**:
A first-class practice item in the Exercise Bank, stored separately from TopicItem and Quiz Question. It has a title, written statement, optional LaTeX and images, difficulty and concept metadata, comments/saves/status, and a written correction that can be revealed by the student.
_Avoid_: Question

**Exercise Workspace**:
The dedicated student-facing workspace for browsing, filtering, opening, revealing corrections, self-grading, saving, and revising Exercises. It is organized by Subject first, then a lightweight Topic Overview, then Topic Exercises for the selected topic. It is separate from the Topic Workspace and quiz rendering.
_Avoid_: Exercise tab, Quiz tab

**Topic Overview**:
A lightweight selector shown inside the Exercise Workspace after the student picks a subject. It shows topic cards or buttons with counts and progress, then opens Topic Exercises for the selected topic. It is not kept pinned above the topic list; students return to it with back navigation.
_Avoid_: Separate topic page, pinned topic selector

**Topic Exercises**:
The Exercise Workspace view for one selected topic, such as Ondes. It shows the topic title, filters, and screenshot-style exercise cards for that topic.
_Avoid_: Topic Exercise List, table view

**Exercise Detail**:
The full-page Exercise reader opened from an Exercise card. On desktop it uses a wide reading column plus a sticky utility rail for status, difficulty, save, reveal, comments, and previous/next controls. Previous/next follows the current filtered Topic Exercises result set. It shows the statement first, then reveals the correction below the statement; self-grade controls appear only after correction reveal. On mobile, rail actions collapse into metadata plus a sticky bottom action bar.
_Avoid_: Exercise modal, side panel, split correction view, centered blob

**Exercise Comments**:
Discussion attached to an Exercise, shown behind a comments tab or section inside Exercise Detail rather than inline in the main statement and correction flow.
_Avoid_: Inline exercise discussion

**Curated Topic Exercise**:
An exercise selected for the student inside a Topic Workspace by a professor or content team. It is separate guided topic content, often video-backed or highly selected for the lesson flow, and does not source from the broad Exercise Bank.
_Avoid_: Exercise Bank

**Course Content**:
The structured explanation inside the Topic Workspace Course tab. It can combine definitions, properties, formulas, diagrams, images, and lightweight animated explanations; it is distinct from Labs, which are experiment-style simulators.
_Avoid_: Lab, simulator, plain text-only course

**Bac Example**:
A curated Bac-style example shown inside a Topic Workspace. It is selected to support the current topic and is not the same thing as the full Exam Bank.
_Avoid_: Exam Bank

**Devoir Blanc**:
A mock exam or exam-style assessment surfaced in the Topic Workspace as part of guided practice. It is distinct from normal exercises and from the full Exam Bank browser.
_Avoid_: Exercise, quiz

**Exercise Editor**:
The backoffice authoring tool for creating, importing, validating, editing, previewing, and publishing Exercises, Exercise Corrections, and Exercise Assets.
_Avoid_: SQLAdmin exercise editing

**Content Status**:
The publication state for learning content. Exercise Bank v1 uses lightweight statuses such as `draft`, `published`, `needs_fix`, and `archived`; mandatory two-person review is not required at launch.
_Avoid_: Review workflow

**Exercise Correction**:
The solved answer for an Exercise, usually one rich LaTeX-capable written body with optional embedded images. Video correction is optional; Exercise Bank is primarily written practice, not a recorded-video library.
_Avoid_: Quiz answer

**Exercise Rich Body**:
A sanitized rich-text body that can contain normal text, formatting, tables, and LaTeX math delimiters, with images referenced through controlled exercise assets rather than arbitrary HTML image tags.
_Avoid_: Raw HTML, Markdown-only content

**Exercise Asset**:
A controlled content asset attached to an Exercise, such as an image, diagram, graph image, PDF, or worksheet. Diagrams and graphs are stored as assets in v1 unless they need true interactivity later.
_Avoid_: User upload, arbitrary HTML image

**Exercise Asset Placeholder**:
A stable marker inside an Exercise Rich Body that references a controlled Exercise Asset, such as `{{asset:diagram-1}}`. The renderer replaces placeholders with approved assets instead of allowing arbitrary image tags in rich HTML.
_Avoid_: img tag, raw image URL

**Exercise Correction Reveal**:
The action that exposes an Exercise Correction after a short frontend reading/attempt delay. It is a learning nudge, not a backend-enforced security rule or graded submission.
_Avoid_: Submit, quiz submit

**Exercise Solved Status**:
A student-owned study status meaning the student says they solved or understood an Exercise. It is not backend-verified correctness and should not be treated the same as passing an official quiz.
_Avoid_: Correct answer, graded pass

**Exercise Self-Grade**:
A student-owned rating of how well they solved or understood an Exercise after viewing the correction. The allowed states are `again`, `partial`, and `mastered`; they support later filtering and revision, but are not backend-verified correctness.
_Avoid_: Score, official grade

**Exercise Card Status**:
The main status marker shown on an Exercise card. It represents the student's current state for that Exercise: `not_started`, `again`, `partial`, or `mastered`. Difficulty is shown separately.
_Avoid_: Difficulty, opened-only status

**Exercise Self-Grade History**:
The timeline of a student's self-grades for an Exercise. It preserves previous `again`, `partial`, and `mastered` entries so students can filter current state and also see whether their understanding improved over time.
_Avoid_: Final score, quiz attempt history

**Exercise XP**:
Small, capped XP awarded from Exercise self-study actions such as first meaningful self-grade or first mastered self-grade. It is motivational XP, not the same as backend-verified quiz or exam correctness XP.
_Avoid_: Verified XP, quiz XP

**QuestionSet**:
A quiz-level data object containing one or more quiz questions. It is the canonical container for official quiz rendering, submission, grading, and attempt tracking.
_Avoid_: Exercise set, question bank

**Quiz Question**:
An individual graded prompt inside a QuestionSet. Quiz questions can have multiple types, such as true/false, numeric answer, multiple choice, fill-in-blank, matching, ordering, drag-and-drop, short answer, multi-select, or interactive checkpoint.
_Avoid_: Exercise

**Exam Bank**:
A student-facing Bac exam workspace containing official Bac exams and Kresco-authored exam-style practice, with filters by source type, subject, filière, year, session type, topic, concept, difficulty, and solution availability.
_Avoid_: Exercise Bank

**Bank Access**:
The access model shared by the Exercise Workspace and Exam Bank. In v1 it is subject-level, with optional freemium/free-preview samples. Locked bank content can remain visible in lists, but protected statements, corrections, videos, and full detail are redacted until subject access is granted.
_Avoid_: Hidden bank content, unrestricted bank detail

**Locked Subject Preview**:
The preview shown after a student selects a locked subject in a bank workspace. It explains why access is locked, how to unlock it, and what the student would get by unlocking the subject.
_Avoid_: Direct payment jump

**Bank Revision Filters**:
The v1 revision mechanism inside Exercise Workspace and Exam Bank. Students filter within each bank by states such as `again`, `partial`, `mastered`, saved, or retry-later instead of using a unified revision queue.
_Avoid_: Unified Revision Queue

**Exam Source Type**:
The origin category of an Exam or Exam Problem. The core source types are official Bac material and Kresco-authored exam-style practice.
_Avoid_: Exam category

**Exam Session Type**:
The Bac session classification for an Exam, such as normal session or rattrapage. It is separate from year, source type, subject, and filière.
_Avoid_: Source type

**Filière**:
A controlled student track slug used for content filtering and access, such as `pc`, `svt`, `sma`, `smb`, or `eco`. Display labels can vary, but stored values should be controlled slugs.
_Avoid_: Free-text track

**Filière Scope**:
The set of filières a piece of learning content applies to. Most content is specific to one or a few filières, but some exercises can be shared across tracks.
_Avoid_: Audience text

**Difficulty Level**:
A controlled learning-content difficulty scale used for filtering, ordering, and visual indicators such as stars or bars. The v1 levels are `easy`, `normal`, `hard`, `bac`, and `challenge`; this is content metadata, not the student's self-grade.
_Avoid_: Free-text difficulty

**Concept Tag**:
A reusable controlled slug for a learning concept, used across Exercises, Quiz Questions, QuestionSets, Exam Problem Parts, TopicItems, and Resources. Content authors can create or propose concept tags during authoring/import, but only approved tags appear in student-facing filters/search while admins maintain the canonical vocabulary.
_Avoid_: Free-text topic keyword

**Exam Problem**:
A first-class exam-specific problem inside an Exam. It has its own exam content model, an overall statement/énoncé, and can contain multiple Exam Problem Parts.
_Avoid_: Exercise

**Exam Problem Part**:
A subpart of an Exam Problem, such as part A, part B, or numbered questions inside the Bac problem. Each part can have its own statement fragment, written correction, video correction, concepts, and progress/revision state.
_Avoid_: Exercise question, Quiz Question

**Exam Part Capsule**:
The student-facing study viewer for one Exam Problem Part. It shows the part video correction above, the written énoncé below, and can include supporting tabs such as formulas, labs, resources, or notes.
_Avoid_: Exercise viewer, Quiz viewer

**Exam Part Supporting Content**:
Exam-specific supplemental content attached to an Exam Problem Part, such as formulas, labs, resources, notes seed content, or rich explanatory text. It belongs to the exam capsule model rather than TopicItem TabContent.
_Avoid_: Topic tab, TabContent
