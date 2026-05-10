# Progress, XP, and Leaderboards

## Principle

Progress and XP are separate.

Progress answers: how much of the topic/course has the student meaningfully completed?

XP answers: how much verified study activity has the student earned across the platform?

## Master progress

Topic progress should include everything meaningful, not just videos.

Suggested weight:

- Main Path: 70-80%.
- Tabs, tools, interactions, resources, notes, quizzes: 20-30%.

The exact weight can change by topic, but the principle is locked: progress should reflect the full learning experience.

## Trackable actions

Track events for:

- Video started.
- Video progress milestone.
- Video completed.
- Quiz attempt started.
- Quiz attempt submitted.
- Quiz passed.
- Quiz retried.
- Lab opened.
- Lab interacted with.
- Interactive course completed.
- PDF/resource opened.
- PDF/resource downloaded.
- Summary opened.
- Notes created.
- Notes edited.
- Saved item created.
- Exam problem opened.
- Exam problem attempted.
- Written solution opened.
- Video solution watched.

## XP model

XP should be awarded across everything, but only for meaningful activity.

Good XP sources:

- Completing videos with watch-time validation.
- First quiz attempts.
- Improved quiz attempts.
- Passing hard quizzes.
- Interacting with simulations.
- Completing interactive checkpoints.
- Working through exam problems.
- Opening/using resources.
- Taking notes.

XP should not be easy to farm.

## Anti-farming rules

Use:

- Server-side validation.
- Event deduplication.
- Minimum watch time.
- Completion thresholds.
- Daily caps.
- Diminishing returns.
- First-attempt emphasis.
- Retry XP limits.
- Meaningful interaction requirements for labs.
- Duplicate resource-open protection.
- Suspicious event detection later.

Optimistic UI is allowed, but server processing is the source of truth.

## Event-driven processing

Preferred model:

```text
Frontend
-> FastAPI Lambda
-> activity_events table
-> SQS
-> worker Lambda
-> validation/dedupe
-> xp_ledger
-> progress aggregates
-> seasonal leaderboard
```

Use event logs for auditability and future analytics.

Use aggregate tables for fast dashboard/profile/topic reads.

## Data concepts

Suggested entities:

- `activity_events`
- `xp_ledger`
- `user_progress`
- `progress_snapshots`
- `leaderboard_seasons`
- `leaderboard_entries`

The event log is append-oriented. Aggregates are derived.

## Quiz attempts

Store:

- First attempt.
- Latest attempt.
- Best attempt.
- Completion status.
- Score.
- Time spent.
- Answers.
- Grading details.

First attempt is important for:

- XP.
- Diagnostics.
- Recommendations.
- Anti-farming.
- Measuring true understanding.

## Leaderboard

Leaderboards should be seasonal.

Season length can be weekly or configured later.

Scope is across everything, not only one feature.

Profile should also show lifetime XP.

If leaderboard rewards are real, XP must be defensible and hard to farm.
