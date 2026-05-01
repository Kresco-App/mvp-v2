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
    body: str
    author: CommentAuthorOut
    parent_id: Optional[int] = None
    reply_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class CommentCreateIn(BaseModel):
    body: str
    content_type: str
    object_id: int
    parent_id: Optional[int] = None
