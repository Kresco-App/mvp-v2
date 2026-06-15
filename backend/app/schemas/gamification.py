from datetime import datetime
from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, field_validator

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


class XPAdjustmentCreateIn(BaseModel):
    user_id: int = Field(gt=0)
    amount: int = Field(ge=-10000, le=10000)
    reason: str = Field(min_length=3, max_length=200)
    idempotency_key: str = Field(min_length=8, max_length=160)

    @field_validator("amount")
    @classmethod
    def amount_must_be_nonzero(cls, value: int) -> int:
        if value == 0:
            raise ValueError("amount must be non-zero")
        return value

    @field_validator("reason", "idempotency_key")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value is required")
        return normalized


class XPAdjustmentOut(BaseModel):
    transaction_id: int
    user_id: int
    amount: int
    requested_amount: int
    reason: str
    description: str
    idempotency_key: str
    actor_user_id: int
    total_xp: int
    created_at: datetime


class XPReasonBreakdownOut(BaseModel):
    reason: str
    count: int
    amount: int
    requested_amount: int


class XPAdminTransactionOut(BaseModel):
    transaction_id: int
    user_id: int
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
    idempotency_key: Optional[str] = None
    daily_cap_category: Optional[str] = None
    daily_cap_date: Optional[date] = None
    cap_applied: bool = False
    created_at: datetime


class XPAdminAuditOut(BaseModel):
    user_id: int
    stored_total_xp: int
    transaction_sum_xp: int
    delta_xp: int
    transaction_count: int
    adjustment_count: int
    adjustment_sum_xp: int
    capped_amount_xp: int
    has_total_mismatch: bool
    reason_breakdown: list[XPReasonBreakdownOut]
    transactions: list[XPAdminTransactionOut]


class LeaderboardEntryOut(BaseModel):
    rank: int
    user_id: int
    full_name: str
    avatar_url: str
    total_xp: int
    level: int
    is_current_user: bool


class XPSeasonLeaderboardEntryOut(BaseModel):
    rank: int
    user_id: int
    full_name: str
    avatar_url: str
    season_xp: int
    total_xp: int
    level: int
    is_current_user: bool


class XPSeasonLeaderboardOut(BaseModel):
    season: str
    starts_at: datetime
    ends_at: datetime
    entries: list[XPSeasonLeaderboardEntryOut]


class UserBadgeOut(BaseModel):
    slug: str
    title: str
    description: str
    category: str
    rarity: str
    earned: bool
    earned_at: Optional[datetime] = None
    evidence: dict = Field(default_factory=dict)


class UserBadgeInventoryOut(BaseModel):
    badges: list[UserBadgeOut]
    earned_count: int
    total_count: int


class ConceptMasteryEntryOut(BaseModel):
    id: int
    concept_slug: str
    context_key: str
    subject_id: Optional[int] = None
    topic_id: Optional[int] = None
    attempts_count: int
    correct_count: int
    incorrect_count: int
    mastery_score: int
    confidence: int
    status: str
    is_weak: bool
    last_result: str
    last_source: str
    last_question_attempt_id: Optional[int] = None
    last_quiz_attempt_id: Optional[int] = None
    last_practiced_at: Optional[datetime] = None
    last_correct_at: Optional[datetime] = None
    last_incorrect_at: Optional[datetime] = None
    updated_at: datetime


class ConceptMasteryListOut(BaseModel):
    total: int
    limit: int
    offset: int
    weak_threshold: int
    items: list[ConceptMasteryEntryOut]


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
