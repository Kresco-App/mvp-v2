from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProgressUpdateIn(BaseModel):
    lesson_id: int
    watched_seconds: int


class ProgressCompleteIn(BaseModel):
    item_type: str
    item_id: int


class SectionCompleteIn(BaseModel):
    section_id: int
    score: int = 0
    correct_answers: int = 0
    total_questions: int = 0


class LessonProgressOut(BaseModel):
    lesson_id: int
    watched_seconds: int
    status: str

    model_config = {"from_attributes": True}


class SubjectPlanOut(BaseModel):
    completed_lesson_ids: list[int]
    completed_block_ids: list[int]
    completed_quiz_ids: list[int]
    completed_section_ids: list[int]
    total_section_count: int
    total_lesson_count: int


class XPOut(BaseModel):
    total_xp: int
    level: int
    xp_progress_pct: float
    xp_for_current_level: int
    xp_for_next_level: int
    streak_days: int


class XPTransactionOut(BaseModel):
    amount: int
    reason: str
    description: str
    created_at: datetime

    model_config = {"from_attributes": True}


class LessonAccessOut(BaseModel):
    can_access: bool
    reason: str
    blocker_lesson_id: Optional[int] = None
    blocker_quiz_id: Optional[int] = None


class LeaderboardEntryOut(BaseModel):
    rank: int
    user_id: int
    full_name: str
    avatar_url: str
    total_xp: int
    level: int
    is_current_user: bool


class DailyQuestOut(BaseModel):
    id: int
    quest_type: str
    title: str
    target: int
    progress: int
    xp_reward: int
    completed: bool

    model_config = {"from_attributes": True}


class UserStatsOut(BaseModel):
    total_watch_minutes: int
    quizzes_passed: int
    lessons_completed: int
    is_pro: bool


class SectionAccessOut(BaseModel):
    can_access: bool
