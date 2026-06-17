# Progress, XP, and Leaderboards

## Current Principle

Progress and XP are separate.

Progress answers how much of a topic the student has completed. XP answers how much verified study activity has been awarded across the platform.

## Current Tables

- `activity_events`
- `topic_item_progress`
- `quiz_attempts`
- `question_attempts`
- `user_xp`
- `xp_transactions`
- `daily_quests`

Lesson and section progress tables remain active for existing lesson/section screens.

## Current Trackable Actions

Track events for:

- Topic item opened.
- Topic item completed.
- Video progress and completion.
- Quiz submitted.
- Question answered correctly or incorrectly.
- Lab opened or completed.
- Resource opened.
- Notes created or edited.
- Exam problem opened or attempted.

## Current XP Rules

XP is awarded through `backend/app/services/xp.py`.

Current reward reasons include:

- `video_complete`
- `quiz_correct`
- `quiz_retry_correct`
- `lab_complete`
- `exam_complete`
- `quiz_pass`
- `quiz_perfect`
- `daily_login`
- `streak_bonus`
- `lesson_complete`

XP awards should include hierarchy context when available:

- `subject_id`
- `topic_id`
- `topic_section_id`
- `topic_item_id`
- `question_set_id`
- `question_id`
- `quiz_attempt_id`
- `question_attempt_id`

Use `idempotency_key` for first-correct and first-pass rewards.

## Current Quiz Attempt Tracking

`QuizAttempt` stores:

- User.
- QuestionSet.
- Subject/topic/section/item/tab context.
- Score.
- Pass/fail.
- Attempt number.
- Duration.
- Answers JSON.
- Grading JSON.

`QuestionAttempt` stores:

- User.
- QuizAttempt.
- Question.
- Selected answer JSON.
- Correct answer JSON.
- Correctness.
- Score awarded.
- Grading metadata.
- Hierarchy context.

## Current Leaderboard Data

Leaderboard UI reads from XP totals and league grouping helpers. XP ledger integrity depends on `xp_transactions`, not client-only state.
