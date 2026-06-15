from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.models.reports import REPORT_PRIORITIES, REPORT_REASONS, REPORT_STATUSES, REPORT_TARGET_TYPES
from app.schemas.limits import JsonBounds, LongText, MediumText, ShortText, StrictInputModel, validate_bounded_json_object

REPORT_METADATA_BOUNDS = JsonBounds(
    max_container_depth=2,
    max_dict_items=40,
    max_list_items=40,
    max_string_length=1000,
    max_total_bytes=16 * 1024,
)


def _normalize_choice(value: str, *, allowed: set[str], field_name: str) -> str:
    normalized = value.strip().lower()
    if normalized not in allowed:
        raise ValueError(f"Unsupported report {field_name}")
    return normalized


class ReportCreateIn(StrictInputModel):
    target_type: ShortText
    target_id: ShortText = ""
    reason: ShortText
    title: ShortText = ""
    description: LongText = ""
    subject_id: int | None = None
    topic_id: int | None = None
    topic_item_id: int | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: ShortText | None = None

    @field_validator("target_type")
    @classmethod
    def validate_target_type(cls, value: str) -> str:
        return _normalize_choice(value, allowed=REPORT_TARGET_TYPES, field_name="target type")

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        return _normalize_choice(value, allowed=REPORT_REASONS, field_name="reason")

    @field_validator("metadata_json")
    @classmethod
    def validate_metadata_json(cls, value: dict[str, Any]) -> dict[str, Any]:
        return validate_bounded_json_object(value, bounds=REPORT_METADATA_BOUNDS)


class ReportUpdateIn(StrictInputModel):
    status: ShortText | None = None
    priority: ShortText | None = None
    assigned_to_user_id: int | None = None
    resolution_note: MediumText | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_choice(value, allowed=REPORT_STATUSES, field_name="status")

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_choice(value, allowed=REPORT_PRIORITIES, field_name="priority")


class ReportOut(BaseModel):
    id: int
    reporter_user_id: int
    target_type: str
    target_id: str
    subject_id: int | None = None
    topic_id: int | None = None
    topic_item_id: int | None = None
    reason: str
    status: str
    priority: str
    title: str
    description: str
    metadata_json: dict[str, Any]
    assigned_to_user_id: int | None = None
    reviewed_by_user_id: int | None = None
    resolution_note: str
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReportListOut(BaseModel):
    items: list[ReportOut]
    total: int
    limit: int
    offset: int
