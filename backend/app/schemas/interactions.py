from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.limits import LongText, ShortText, StrictInputModel


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


class SavedItemCreateIn(StrictInputModel):
    target_type: ShortText
    target_id: int
    subject_id: int | None = None
    topic_id: int | None = None
    topic_item_id: int | None = None
    label: ShortText = ""


class SavedItemOut(BaseModel):
    id: int
    target_type: str
    target_id: int
    subject_id: int | None = None
    topic_id: int | None = None
    topic_item_id: int | None = None
    label: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CommentCreateIn(StrictInputModel):
    body: LongText
    topic_item_id: int
    parent_id: Optional[int] = None


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
