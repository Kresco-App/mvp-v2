from typing import Dict

from pydantic import BaseModel, Field

from app.schemas.limits import StrictInputModel


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
    lesson_id: int | None = Field(default=None, serialization_alias="lessonId")
    quiz: QuizOut | None = None

    model_config = {"populate_by_name": True}


class QuizSubmitIn(StrictInputModel):
    answers: Dict[int, int]


class QuizResultOut(BaseModel):
    score: int
    passed: bool
    correct: int
    total: int
    pass_score: int
    xp_earned: int
