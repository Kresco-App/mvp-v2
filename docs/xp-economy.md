# XP Economy

This document records the current XP policy decisions that the backend enforces.
It is intentionally small until mastery, seasons, badges, and admin adjustments
land.

## Source Of Truth

- Backend services are the source of truth for XP.
- Frontend state can display XP, but it must not grant XP.
- Every real XP award must use a user-scoped idempotency key.
- `XPTransaction.amount` is the awarded amount after policy and cap checks.
- `XPTransaction.requested_amount` is the amount requested after reward policy
  bounds but before daily cap clipping.

## Current Rewards

| Reason | Base XP | Category | Notes |
| --- | ---: | --- | --- |
| `quiz_correct` | 5 | `quiz_correct` | First correct official question only. |
| `quiz_retry_correct` | 3 | `quiz_correct` | Reserved. |
| `quiz_pass` | 20 | `quiz_pass` | First pass per question set. |
| `quiz_perfect` | 15 | `quiz_pass` | Reserved. |
| `exercise_mastered` | 5 override max | `exercise` | Self-reported, requires reveal, one-time per exercise. |
| `video_complete` | 10 | `lesson_video` | Backend completion only. |
| `lesson_complete` | 10 | `lesson_video` | Backend completion only. |
| `lab_complete` | 50 | `lab_exam` | Backend completion only. |
| `exam_complete` | 100 | `lab_exam` | Reserved. |
| `daily_quest` | 75 override max | `daily_quest` | Quest row reward is bounded by policy. |
| `daily_login` | 10 | `daily_quest` | Reserved. |
| `streak_bonus` | 25 | `daily_quest` | Reserved. |

## Daily Caps

Daily caps are enforced by `active_date`, not by server `created_at`, so tests,
backfills, and time-zone-aware activity can use the same policy.

| Category | Daily Cap |
| --- | ---: |
| `quiz_correct` | 100 |
| `quiz_pass` | 80 |
| `exercise` | 25 |
| `lesson_video` | 80 |
| `lab_exam` | 150 |
| `daily_quest` | 75 |
| `other` | 100 |

When an award exceeds the remaining cap, the backend writes an XP transaction
with the clipped amount and `cap_applied=true`. If the category is already at
cap, the transaction amount is `0` so the attempted award remains auditable
without changing totals, quests, or leaderboard projections.

## Override Policy

`amount_override` is allowed only for known bounded reasons:

- `exercise_mastered <= 5`
- `daily_quest <= 75`

Unknown override reasons are rejected. Negative XP awards are rejected until a
separate reversal/adjustment workflow exists.

## Deferred

- XP reversals and admin adjustments.
- Seasons and seasonal leaderboards.
- Badge definitions and badge awards.
- Per-concept mastery scoring.
- Staff-facing XP audit dashboard.
