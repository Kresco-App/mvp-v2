from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class GoogleLoginIn(BaseModel):
    credential: str


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
    created_at: datetime

    model_config = {"from_attributes": True}


class AuthSessionOut(BaseModel):
    user: UserOut


class SignupPendingOut(BaseModel):
    message: str
    email: str


class MessageOut(BaseModel):
    message: str


class UserUpdateIn(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    banner_url: Optional[str] = None
    niveau: Optional[str] = None
    filiere: Optional[str] = None


class ProfileMediaOut(BaseModel):
    url: str


class SignupIn(BaseModel):
    email: str
    password: str
    full_name: str


class LoginIn(BaseModel):
    email: str
    password: str


class VerifyEmailIn(BaseModel):
    token: str


class ResendVerificationIn(BaseModel):
    email: str


class ForgotPasswordIn(BaseModel):
    email: str


class ResetPasswordIn(BaseModel):
    token: str
    password: str
