from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.limits import EmailText, PasswordText, ShortText, StrictInputModel, TokenText, UrlText


class GoogleLoginIn(StrictInputModel):
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
    created_at: datetime

    model_config = {"from_attributes": True}


class AuthSessionOut(BaseModel):
    user: UserOut
    csrf_token: str = ""


class CsrfOut(BaseModel):
    csrf_token: str


class SignupPendingOut(BaseModel):
    message: str
    email: str


class MessageOut(BaseModel):
    message: str


class UserUpdateIn(StrictInputModel):
    full_name: Optional[ShortText] = None
    avatar_url: Optional[UrlText] = None
    banner_url: Optional[UrlText] = None
    niveau: Optional[ShortText] = None
    filiere: Optional[ShortText] = None


class ProfileMediaOut(BaseModel):
    url: str


class SignupIn(StrictInputModel):
    email: EmailText
    password: PasswordText
    full_name: ShortText


class LoginIn(StrictInputModel):
    email: EmailText
    password: PasswordText


class VerifyEmailIn(StrictInputModel):
    token: TokenText


class ResendVerificationIn(StrictInputModel):
    email: EmailText


class ForgotPasswordIn(StrictInputModel):
    email: EmailText


class ResetPasswordIn(StrictInputModel):
    token: TokenText
    password: PasswordText
