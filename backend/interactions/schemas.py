from ninja import Schema
from typing import List, Optional
from datetime import datetime


class CommentAuthorOut(Schema):
    id: int
    full_name: str
    avatar_url: str


class CommentOut(Schema):
    id: int
    body: str
    author: CommentAuthorOut
    parent_id: Optional[int] = None
    reply_count: int = 0
    created_at: datetime


class CommentCreateIn(Schema):
    body: str
    content_type: str   # e.g. 'lesson' or 'chapter'
    object_id: int
    parent_id: Optional[int] = None
