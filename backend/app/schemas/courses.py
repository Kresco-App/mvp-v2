from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.limits import ShortText, StrictInputModel, validate_quiz_answers_payload


class SubjectListOut(BaseModel):
    id: int
    title: str
    description: str
    thumbnail_url: str
    is_published: bool
    order: int
    chapter_count: int = 0
    lesson_count: int = 0

    model_config = {"from_attributes": True}


class SubjectDetailOut(BaseModel):
    id: int
    title: str
    description: str
    thumbnail_url: str
    is_published: bool

    model_config = {"from_attributes": True}


class StreamOut(BaseModel):
    otp: str
    playback_info: str
    watched_seconds: int = 0
    resume_seconds: int = 0


class ResourceOut(BaseModel):
    id: int
    title: str
    resource_type: str
    provider: str = ""
    provider_resource_id: str = ""
    url: str = ""
    summary: str = ""
    metadata_json: dict = {}
    is_free_preview: bool = False
    required_tier: str = ""
    required_feature_key: str = ""
    required_subject_id: Optional[int] = None
    can_access: bool = True
    locked_reason: str = ""
    access_reason: str = "unlocked"

    model_config = {"from_attributes": True}


class TabContentOut(BaseModel):
    id: int
    label: str
    tab_type: str
    content: str = ""
    config_json: dict = {}
    renderer_key: str = ""
    order: int
    concept_slugs: list[str] = []
    resource: Optional[ResourceOut] = None
    required_tier: str = ""
    required_feature_key: str = ""
    required_subject_id: Optional[int] = None
    can_access: bool = True
    locked_reason: str = ""
    access_reason: str = "unlocked"

    model_config = {"from_attributes": True}


class TopicItemOut(BaseModel):
    id: int
    topic_id: int
    section_id: int
    title: str
    description: str = ""
    item_type: str
    renderer_key: str = ""
    duration_seconds: int = 0
    order: int
    completion_policy: str = "manual"
    is_free_preview: bool = False
    concept_slugs: list[str] = []
    primary_resource: Optional[ResourceOut] = None
    primary_tab_content_id: Optional[int] = None
    primary_tab: Optional[TabContentOut] = None
    tabs: list[TabContentOut] = []
    progress_status: str = "not_started"
    watched_seconds: int = 0
    resume_seconds: int = 0
    best_score: Optional[int] = None
    required_tier: str = ""
    required_feature_key: str = ""
    required_subject_id: Optional[int] = None
    can_access: bool = True
    locked_reason: str = ""
    access_reason: str = "unlocked"

    model_config = {"from_attributes": True}


class TopicSectionOut(BaseModel):
    id: int
    title: str
    section_type: str
    order: int
    items: list[TopicItemOut] = []

    model_config = {"from_attributes": True}


class TopicCardOut(BaseModel):
    id: int
    subject_id: int
    subject_title: str
    slug: str
    title: str
    description: str
    is_free_preview: bool
    item_count: int = 0
    completed_count: int = 0
    progress_pct: int = 0
    concepts: list[str] = []
    required_tier: str = ""
    required_feature_key: str = ""
    required_subject_id: Optional[int] = None
    can_access: bool = True
    locked_reason: str = ""
    access_reason: str = "unlocked"


class TopicWorkspaceOut(BaseModel):
    id: int
    subject_id: int
    subject_title: str
    slug: str
    title: str
    description: str
    progress_pct: int
    completed_count: int
    item_count: int
    required_tier: str = ""
    required_feature_key: str = ""
    required_subject_id: Optional[int] = None
    can_access: bool = True
    locked_reason: str = ""
    access_reason: str = "unlocked"
    active_item_id: Optional[int]
    sections: list[TopicSectionOut]
    active_item: Optional[TopicItemOut]
    search_results: list[TopicItemOut] = []


class TopicItemCompleteIn(StrictInputModel):
    watched_seconds: int = Field(default=0, ge=0)
    score: Optional[int] = Field(default=None, ge=0, le=100)


class TabQuizSubmitIn(StrictInputModel):
    answers: dict[ShortText, Any]
    duration_seconds: int = 0

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, value: dict[ShortText, Any]) -> dict[ShortText, Any]:
        return validate_quiz_answers_payload(value)


class TabQuizQuestionGradeOut(BaseModel):
    id: str
    type: str
    correct: bool
    answered: bool


class TabQuizGradingOut(BaseModel):
    questions: list[TabQuizQuestionGradeOut] = Field(default_factory=list)


class TabQuizAttemptSummaryOut(BaseModel):
    id: int
    attempt_number: int
    score: int
    passed: bool
    correct: int
    total: int
    pass_score: int
    submitted_at: Optional[datetime] = None
    grading: TabQuizGradingOut = Field(default_factory=TabQuizGradingOut)


class TabQuizResultOut(BaseModel):
    score: int
    passed: bool
    correct: int
    total: int
    pass_score: int
    xp_earned: int
    grading: TabQuizGradingOut
    attempt: Optional[TabQuizAttemptSummaryOut] = None


class ExamProblemOut(BaseModel):
    id: int
    exam_id: int
    topic_id: Optional[int] = None
    title: str
    statement: str
    written_solution: str
    written_solution_url: str
    difficulty: str
    concept_slugs: list[str] = []
    video_resource: Optional[ResourceOut] = None
    required_tier: str = ""
    required_feature_key: str = ""
    required_subject_id: Optional[int] = None
    can_access: bool = True
    locked_reason: str = ""
    access_reason: str = "unlocked"

    model_config = {"from_attributes": True}

class ExamOut(BaseModel):
    id: int
    subject_id: int
    subject_title: str = ""
    title: str
    year: int
    session: str
    statement_url: str
    required_tier: str = ""
    required_feature_key: str = ""
    required_subject_id: Optional[int] = None
    can_access: bool = True
    locked_reason: str = ""
    access_reason: str = "unlocked"
    problems: list[ExamProblemOut] = []

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def redact_if_locked(self) -> "ExamOut":
        if not self.can_access:
            self.statement_url = ""
        return self
