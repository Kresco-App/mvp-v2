from ninja import Schema
from typing import Optional
from datetime import datetime


class GoogleLoginIn(Schema):
    credential: str


class TokenOut(Schema):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(Schema):
    id: int
    email: str
    full_name: str
    avatar_url: str
    role: str
    is_pro: bool
    niveau: str = ''
    filiere: str = ''
    created_at: datetime


class UserUpdateIn(Schema):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    niveau: Optional[str] = None
    filiere: Optional[str] = None


TokenOut.model_rebuild()
