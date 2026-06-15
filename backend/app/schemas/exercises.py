from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.schemas.courses import AccessGuardedMixin


class ExerciseAssetOut(BaseModel):
    id: int
    asset_type: str
    url: str
    alt_text: str = ""
    caption: str = ""
    metadata_json: dict[str, Any] = {}
    order: int = 0

    model_config = {"from_attributes": True}


class ExerciseListItemOut(AccessGuardedMixin):
    id: int
    subject_id: int
    topic_id: int | None = None
    title: str
    slug: str
    summary: str = ""
    difficulty: str
    estimated_minutes: int = 0
    order: int = 0
    concept_slugs: list[str] = []
    is_free_preview: bool = False
    self_grade: str = "not_started"
    saved: bool = False
    has_solution_body: bool = False
    has_solution_video: bool = False
    asset_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ExerciseDetailOut(ExerciseListItemOut):
    statement_body: str = ""
    solution_body: str = ""
    solution_video_url: str = ""
    assets: list[ExerciseAssetOut] = []
    reveal_count: int = 0
    first_revealed_at: datetime | None = None
    last_revealed_at: datetime | None = None
    self_grade_history: list[dict[str, Any]] = []
    notes: str = ""
    metadata_json: dict[str, Any] = {}


class ExerciseBankListOut(BaseModel):
    subject_id: int
    topic_id: int | None = None
    items: list[ExerciseListItemOut]
    total: int
