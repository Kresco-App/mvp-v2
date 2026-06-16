from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.schemas.limits import ShortText, StrictInputModel, validate_quiz_answers_payload


class QuizOptionOut(BaseModel):
    id: int
    text: str

    model_config = {"from_attributes": True}


class QuizQuestionOut(BaseModel):
    id: int
    text: str
    order: int
    options: list[QuizOptionOut] = []

    model_config = {"from_attributes": True}


class QuizOut(BaseModel):
    id: int
    title: str
    pass_score: int
    questions: list[QuizQuestionOut] = []

    model_config = {"from_attributes": True}


class QuizDiscoveryOut(BaseModel):
    subject_id: int = Field(serialization_alias="subjectId")
    quiz: QuizOut | None = None

    model_config = {"populate_by_name": True}


class QuizSubmitIn(StrictInputModel):
    answers: dict[ShortText, Any]

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, value: dict[ShortText, Any]) -> dict[ShortText, Any]:
        return validate_quiz_answers_payload(value)


class QuizResultOut(BaseModel):
    score: int
    passed: bool
    correct: int
    total: int
    pass_score: int
    xp_earned: int


class QuizAttemptQuestionResultOut(BaseModel):
    id: str
    type: str
    correct: bool
    answered: bool


class QuizAttemptSummaryOut(BaseModel):
    id: int
    attempt_number: int
    score: int
    passed: bool
    correct: int
    total: int
    pass_score: int
    duration_seconds: int = 0
    submitted_at: datetime | None = None
    questions: list[QuizAttemptQuestionResultOut] = Field(default_factory=list)


class QuizAttemptHistoryOut(BaseModel):
    question_set_id: int
    total: int
    limit: int
    offset: int
    items: list[QuizAttemptSummaryOut] = Field(default_factory=list)
