from datetime import datetime
from datetime import date
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.limits import ShortText, StrictInputModel


class XPOut(BaseModel):
    total_xp: int
    level: int
    xp_progress_pct: float
    xp_for_current_level: int
    xp_for_next_level: int
    streak_days: int


class XPTransactionOut(BaseModel):
    amount: int
    requested_amount: int = 0
    reason: str
    description: str
    subject_id: Optional[int] = None
    topic_id: Optional[int] = None
    topic_section_id: Optional[int] = None
    topic_item_id: Optional[int] = None
    question_set_id: Optional[int] = None
    question_id: Optional[int] = None
    quiz_attempt_id: Optional[int] = None
    question_attempt_id: Optional[int] = None
    daily_cap_category: Optional[str] = None
    daily_cap_date: Optional[date] = None
    cap_applied: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


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


class SidebarCountdownUnitOut(BaseModel):
    value: int | str
    label: str


class SidebarCalendarDayOut(BaseModel):
    id: str
    value: int | str
    label: str
    active: bool = False


class SidebarLiveEventOut(BaseModel):
    id: int | str
    title: str
    starts_at: str
    subject: str
    href: str = "/live"
    status: str = "upcoming"


class SidebarStrikeDayOut(BaseModel):
    label: str
    done: bool = False


class SidebarSummaryOut(BaseModel):
    chrono_units: list[SidebarCountdownUnitOut]
    calendar_days: list[SidebarCalendarDayOut]
    live_events: list[SidebarLiveEventOut]
    strike_days: list[SidebarStrikeDayOut]
    quests: list[DailyQuestOut]
    leaderboard_entries: list[LeaderboardEntryOut]


class MistakeNotebookEntryOut(BaseModel):
    id: int
    question_id: int
    question_set_id: Optional[int] = None
    subject_id: Optional[int] = None
    topic_id: Optional[int] = None
    topic_section_id: Optional[int] = None
    topic_item_id: Optional[int] = None
    tab_content_id: Optional[int] = None
    status: str
    mistake_count: int
    corrected_count: int
    last_answer_json: dict = Field(default_factory=dict)
    last_mistake_at: Optional[datetime] = None
    last_correct_at: Optional[datetime] = None
    updated_at: datetime
    question_title: str = ""
    question_prompt: str = ""
    question_type: str = ""
    question_difficulty: str = ""
    question_concept_slugs: list[str] = Field(default_factory=list)


class MistakeNotebookListOut(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[MistakeNotebookEntryOut]


class UserStatsOut(BaseModel):
    total_watch_minutes: int
    quizzes_passed: int
    items_completed: int
    is_pro: bool
