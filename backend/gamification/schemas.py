from ninja import Schema
from typing import List, Optional
from datetime import datetime


class ProgressUpdateIn(Schema):
    lesson_id: int
    watched_seconds: int


class ProgressCompleteIn(Schema):
    item_type: str
    item_id: int


class SectionCompleteIn(Schema):
    section_id: int
    score: int = 0
    correct_answers: int = 0
    total_questions: int = 0


class SubjectPlanOut(Schema):
    completed_lesson_ids: List[int]
    completed_block_ids: List[int]
    completed_quiz_ids: List[int]


class LessonProgressOut(Schema):
    lesson_id: int
    watched_seconds: int
    status: str


class XPOut(Schema):
    total_xp: int
    level: int
    xp_progress_pct: int
    xp_for_next_level: int
    streak_days: int


class XPTransactionOut(Schema):
    amount: int
    reason: str
    description: str
    created_at: datetime


class LessonAccessOut(Schema):
    can_access: bool
    reason: str  # 'free_preview' | 'unlocked' | 'requires_pro' | 'previous_lesson_incomplete' | 'previous_quiz_not_passed'
    blocker_lesson_id: Optional[int] = None
    blocker_quiz_id: Optional[int] = None


class VideoQuizTriggerOut(Schema):
    id: int
    timestamp_seconds: int
    quiz_id: int
    is_blocking: bool


class LeaderboardEntryOut(Schema):
    rank: int
    user_id: int
    full_name: str
    avatar_url: str
    total_xp: int
    level: int
    is_current_user: bool = False


class DailyQuestOut(Schema):
    id: int
    quest_type: str
    title: str
    target: int
    progress: int
    xp_reward: int
    completed: bool


class UserStatsOut(Schema):
    total_watch_minutes: int
    quizzes_passed: int
    lessons_completed: int
    is_pro: bool
