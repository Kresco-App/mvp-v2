from datetime import datetime, timedelta, timezone
from dataclasses import dataclass

import jwt
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.config import Settings

AUTH_COOKIE_NAME = "kresco_token"
AUTH_ROLE_COOKIE_NAME = "kresco_user_role"


@dataclass(frozen=True)
class AuthTokenPayload:
    user_id: int
    token_version: int


def _token_subject(subject: int | object, token_version: int | None) -> AuthTokenPayload:
    if isinstance(subject, int):
        return AuthTokenPayload(
            user_id=_coerce_user_id(subject),
            token_version=_coerce_token_version(0 if token_version is None else token_version),
        )

    user_id = getattr(subject, "id", None)
    if user_id is None:
        raise ValueError("Token subject must be a user id or object with an id")

    version = token_version
    if version is None:
        version = getattr(subject, "auth_token_version", 0)
        if version is None:
            version = 0

    return AuthTokenPayload(
        user_id=_coerce_user_id(user_id),
        token_version=_coerce_token_version(version),
    )


def _coerce_user_id(value: object) -> int:
    if isinstance(value, bool):
        raise ValueError("Token user id must be a positive integer")
    try:
        user_id = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Token user id must be a positive integer") from exc
    if user_id <= 0:
        raise ValueError("Token user id must be a positive integer")
    return user_id


def _coerce_token_version(value: object) -> int:
    if isinstance(value, bool):
        raise ValueError("Token version must be a non-negative integer")
    try:
        token_version = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Token version must be a non-negative integer") from exc
    if token_version < 0:
        raise ValueError("Token version must be a non-negative integer")
    return token_version


def create_token(subject: int | object, settings: Settings, *, token_version: int | None = None) -> str:
    token_subject = _token_subject(subject, token_version)
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": token_subject.user_id,
        "token_version": token_subject.token_version,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
        "iat": now,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str, settings: Settings) -> AuthTokenPayload:
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    try:
        user_id = _coerce_user_id(payload["user_id"])
        raw_token_version = payload.get("token_version", 0)
        token_version = _coerce_token_version(0 if raw_token_version is None else raw_token_version)
    except (KeyError, TypeError, ValueError) as exc:
        raise jwt.InvalidTokenError("Invalid auth token payload") from exc
    return AuthTokenPayload(user_id=user_id, token_version=token_version)


def verify_google_token(credential: str, client_id: str) -> dict:
    return id_token.verify_oauth2_token(
        credential,
        google_requests.Request(),
        client_id,
    )
