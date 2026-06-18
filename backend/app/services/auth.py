import asyncio
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass

import jwt

from app.config import Settings

AUTH_COOKIE_NAME = "kresco_token"
AUTH_ROLE_COOKIE_NAME = "kresco_user_role"
FIREBASE_AUTH_APP_NAME_PREFIX = "kresco-auth-"
FIREBASE_PROVIDER_GOOGLE = "google.com"
FIREBASE_PROVIDER_PASSWORD = "password"
SUPPORTED_FIREBASE_SIGN_IN_PROVIDERS = {
    FIREBASE_PROVIDER_GOOGLE,
    FIREBASE_PROVIDER_PASSWORD,
}


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
    if not isinstance(subject, int):
        role = getattr(subject, "role", None)
        if isinstance(role, str):
            payload["role"] = role
        is_staff = getattr(subject, "is_staff", None)
        if is_staff is not None:
            payload["is_staff"] = bool(is_staff)
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


def _firebase_auth_app(project_id: str):
    import firebase_admin

    app_name = f"{FIREBASE_AUTH_APP_NAME_PREFIX}{project_id}"
    try:
        return firebase_admin.get_app(app_name)
    except ValueError:
        return firebase_admin.initialize_app(options={"projectId": project_id}, name=app_name)


def _firebase_string_claim(payload: dict, *names: str) -> str:
    for name in names:
        value = payload.get(name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _firebase_claim(payload: dict) -> dict:
    firebase_claim = payload.get("firebase")
    if not isinstance(firebase_claim, dict):
        raise jwt.InvalidTokenError("Firebase provider claim is missing")
    return firebase_claim


def _firebase_sign_in_provider(firebase_claim: dict) -> str:
    provider = firebase_claim.get("sign_in_provider")
    if not isinstance(provider, str) or not provider.strip():
        raise jwt.InvalidTokenError("Firebase sign-in provider is missing")
    provider = provider.strip()
    if provider not in SUPPORTED_FIREBASE_SIGN_IN_PROVIDERS:
        raise jwt.InvalidTokenError("Firebase sign-in provider is not supported")
    return provider


def _firebase_provider_identity(firebase_claim: dict, provider: str) -> str | None:
    identities = firebase_claim.get("identities")
    provider_identities = identities.get(provider) if isinstance(identities, dict) else None
    if isinstance(provider_identities, list):
        for identity in provider_identities:
            if isinstance(identity, str) and identity.strip():
                return identity.strip()
    return None


def _firebase_session_payload_from_firebase(payload: dict) -> dict:
    firebase_uid = _firebase_string_claim(payload, "uid", "user_id", "sub")
    if not firebase_uid:
        raise jwt.InvalidTokenError("Firebase UID is missing")

    firebase_claim = _firebase_claim(payload)
    provider = _firebase_sign_in_provider(firebase_claim)
    provider_identity = _firebase_provider_identity(firebase_claim, provider)
    google_id = provider_identity if provider == FIREBASE_PROVIDER_GOOGLE else None
    if provider == FIREBASE_PROVIDER_GOOGLE and not google_id:
        raise jwt.InvalidTokenError("Firebase Google identity is missing")

    return {
        "email": payload.get("email"),
        "email_verified": payload.get("email_verified"),
        "name": payload.get("name") or "",
        "picture": payload.get("picture") or "",
        "firebase_uid": firebase_uid,
        "provider": provider,
        "google_id": google_id,
    }


async def verify_firebase_token(credential: str, project_id: str) -> dict:
    from firebase_admin import auth as firebase_auth

    project_id = project_id.strip()
    if not project_id:
        raise jwt.InvalidAudienceError("Firebase project id is not configured")

    app = _firebase_auth_app(project_id)
    payload = await asyncio.to_thread(firebase_auth.verify_id_token, credential, app=app)
    return _firebase_session_payload_from_firebase(payload)
