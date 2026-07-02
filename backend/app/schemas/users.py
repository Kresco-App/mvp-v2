from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.schemas.limits import ProfileMediaReferenceText, ShortText, StrictInputModel, TokenText


class FirebaseSessionIn(StrictInputModel):
    credential: TokenText


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    avatar_url: str
    banner_url: str = ""
    role: str
    tier: str = "basic"
    is_staff: bool = False
    is_pro: bool
    niveau: str
    filiere: str
    is_email_verified: bool
    phone_number: Optional[str] = None
    is_phone_verified: bool = False
    phone_verified_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuthSessionOut(BaseModel):
    user: UserOut
    csrf_token: str = ""


class CsrfOut(BaseModel):
    csrf_token: str


class MessageOut(BaseModel):
    message: str


class UserUpdateIn(StrictInputModel):
    full_name: Optional[ShortText] = None
    avatar_url: Optional[ProfileMediaReferenceText] = None
    banner_url: Optional[ProfileMediaReferenceText] = None
    niveau: Optional[ShortText] = None
    filiere: Optional[ShortText] = None

    @field_validator("avatar_url", "banner_url")
    @classmethod
    def validate_profile_media_reference(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return value
        if value.startswith("/media/profile/") or value.startswith("gs://"):
            return value
        raise ValueError("Profile media must be uploaded through the profile media endpoint")


class ProfileMediaOut(BaseModel):
    url: str
