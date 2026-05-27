from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CommentAuthorOut(BaseModel):
    id: int
    full_name: str
    avatar_url: str

    model_config = {"from_attributes": True}


class CommentOut(BaseModel):
    id: int
    topic_item_id: int
    body: str
    author: CommentAuthorOut
    parent_id: Optional[int] = None
    reply_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class NoteCreateIn(BaseModel):
    subject_id: int | None = None
    topic_id: int | None = None
    topic_item_id: int | None = None
    tab_content_id: int | None = None
    body: str


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


class SavedItemCreateIn(BaseModel):
    target_type: str
    target_id: int
    subject_id: int | None = None
    topic_id: int | None = None
    topic_item_id: int | None = None
    label: str = ""


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


class CommentCreateIn(BaseModel):
    body: str
    topic_item_id: int
    parent_id: Optional[int] = None
