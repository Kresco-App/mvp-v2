from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.interactions import CANVAS_TARGET_TYPES
from app.schemas.limits import JsonBounds, LongText, ShortText, StrictInputModel, validate_bounded_json_object

CANVAS_SCENE_BOUNDS = JsonBounds(
    max_container_depth=12,
    max_dict_items=10000,
    max_list_items=20000,
    max_string_length=20000,
    max_total_bytes=1024 * 1024,
)
MAX_SAVE_TAGS = 8
MAX_SAVE_TAG_LENGTH = 32


class CommentAuthorOut(BaseModel):
    id: int
    full_name: str
    avatar_url: str

    model_config = {"from_attributes": True}


class CommentOut(BaseModel):
    id: int
    topic_item_id: int | None = None
    exercise_id: int | None = None
    body: LongText
    rating: int | None = None
    status: str = "visible"
    author: CommentAuthorOut
    parent_id: Optional[int] = None
    reply_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class NoteCreateIn(StrictInputModel):
    subject_id: int | None = None
    topic_id: int | None = None
    topic_item_id: int | None = None
    tab_content_id: int | None = None
    body: LongText


class NoteUpdateIn(StrictInputModel):
    body: LongText


class NoteOut(BaseModel):
    id: int
    subject_id: int | None = None
    topic_id: int | None = None
    topic_item_id: int | None = None
    tab_content_id: int | None = None
    body: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CanvasDocumentPutIn(StrictInputModel):
    target_type: ShortText
    target_id: int
    scene_json: dict[str, Any]
    base_version: int | None = None

    @field_validator("target_type")
    @classmethod
    def validate_canvas_target_type(cls, value: str) -> str:
        normalized = value.strip()
        if normalized not in CANVAS_TARGET_TYPES:
            raise ValueError(f"Canvas target_type must be one of: {sorted(CANVAS_TARGET_TYPES)}")
        return normalized

    @field_validator("scene_json")
    @classmethod
    def validate_scene_json(cls, value: dict[str, Any]) -> dict[str, Any]:
        scene = validate_bounded_json_object(value, bounds=CANVAS_SCENE_BOUNDS)
        if _contains_data_url(scene):
            raise ValueError("Canvas scenes cannot contain embedded data URLs")
        return scene


class CanvasDocumentOut(BaseModel):
    id: int | None = None
    target_type: str
    target_id: int
    subject_id: int | None = None
    topic_id: int | None = None
    topic_item_id: int | None = None
    scene_json: dict[str, Any]
    scene_version: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class SavedItemCreateIn(StrictInputModel):
    target_type: ShortText
    target_id: int
    subject_id: int | None = None
    topic_id: int | None = None
    topic_item_id: int | None = None
    label: ShortText = ""
    note: str = Field(default="", max_length=500)
    tags: list[ShortText] = Field(default_factory=list)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str) -> str:
        return value.strip()

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for tag in value:
            cleaned = " ".join(tag.strip().split())
            if not cleaned:
                continue
            if len(cleaned) > MAX_SAVE_TAG_LENGTH:
                raise ValueError(f"Tags must be {MAX_SAVE_TAG_LENGTH} characters or fewer")
            key = cleaned.casefold()
            if key in seen:
                continue
            seen.add(key)
            normalized.append(cleaned)
            if len(normalized) > MAX_SAVE_TAGS:
                raise ValueError(f"Saved items support at most {MAX_SAVE_TAGS} tags")
        return normalized


class SavedItemOut(BaseModel):
    id: int
    target_type: str
    target_id: int
    subject_id: int | None = None
    topic_id: int | None = None
    topic_item_id: int | None = None
    label: str
    note: str = ""
    tags: list[str] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class CommentCreateIn(StrictInputModel):
    body: LongText
    topic_item_id: int
    parent_id: Optional[int] = None
    rating: int | None = Field(default=None, ge=1, le=5)


class ExerciseCommentCreateIn(StrictInputModel):
    body: LongText
    exercise_id: int
    parent_id: Optional[int] = None


class InteractionDeleteOut(BaseModel):
    ok: bool
    id: int


class ResourceOpenIn(StrictInputModel):
    topic_item_id: int | None = None
    tab_content_id: int | None = None


class ResourceOpenOut(BaseModel):
    ok: bool
    resource_id: int
    title: str
    resource_type: str
    subject_id: int | None = None
    topic_id: int | None = None
    topic_item_id: int | None = None
    tab_content_id: int | None = None
    progress_status: str = "not_tracked"
    opened_at: datetime


def _contains_data_url(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower().startswith("data:")
    if isinstance(value, list):
        return any(_contains_data_url(item) for item in value)
    if isinstance(value, dict):
        return any(_contains_data_url(item) for item in value.values())
    return False
