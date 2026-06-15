from datetime import datetime

from pydantic import BaseModel, field_validator

from app.schemas.courses import AccessGuardedMixin, ResourceOut


class ExamProblemPartOut(AccessGuardedMixin):
    id: int
    exam_problem_id: int
    topic_id: int | None = None
    video_resource_id: int | None = None
    part_label: str = ""
    title: str
    statement_body: str = ""
    written_solution_body: str = ""
    written_solution_url: str = ""
    correction_video_url: str = ""
    order: int = 0
    difficulty: str = "bac"
    concept_slugs: list[str] = []
    metadata_json: dict = {}
    video_resource: ResourceOut | None = None


class ExamBankProblemOut(AccessGuardedMixin):
    id: int
    exam_id: int
    topic_id: int | None = None
    title: str
    statement: str = ""
    written_solution: str = ""
    written_solution_url: str = ""
    difficulty: str = "bac"
    concept_slugs: list[str] = []
    video_resource: ResourceOut | None = None
    parts: list[ExamProblemPartOut] = []
    progress_status: str = "not_started"
    saved: bool = False


class ExamBankExamOut(AccessGuardedMixin):
    id: int
    subject_id: int
    subject_title: str = ""
    title: str
    year: int
    session: str
    statement_url: str = ""
    problems: list[ExamBankProblemOut] = []


class ExamBankListOut(BaseModel):
    subject_id: int | None = None
    topic_id: int | None = None
    items: list[ExamBankExamOut]
    total: int


class ExamBankProblemDetailOut(ExamBankProblemOut):
    exam_title: str
    subject_id: int
    subject_title: str = ""
    year: int
    session: str
    created_at: datetime | None = None


class ExamProblemProgressIn(BaseModel):
    status: str | None = None
    saved: bool | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip().lower()
        if normalized not in {"opened", "completed"}:
            raise ValueError("status must be one of: opened, completed")
        return normalized


class ExamProblemProgressOut(BaseModel):
    exam_problem_id: int
    status: str = "not_started"
    saved: bool = False
    opened_at: datetime | None = None
    completed_at: datetime | None = None
    last_activity_at: datetime | None = None
