from datetime import datetime

from pydantic import BaseModel

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
