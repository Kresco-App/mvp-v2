import json
import time
import asyncio
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass

import httpx
import jwt
from jwt.algorithms import RSAAlgorithm

from app.config import Settings

AUTH_COOKIE_NAME = "kresco_token"
AUTH_ROLE_COOKIE_NAME = "kresco_user_role"
GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_JWKS_DEFAULT_TTL_SECONDS = 3600
GOOGLE_ID_TOKEN_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
GOOGLE_ID_TOKEN_ALGORITHMS = ["RS256"]

_google_jwks_cache: tuple[float, dict] | None = None
_google_jwks_lock: asyncio.Lock | None = None


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


def _cache_ttl_seconds(cache_control: str) -> int:
    for directive in cache_control.split(","):
        directive = directive.strip().lower()
        if not directive.startswith("max-age="):
            continue
        try:
            return max(1, int(directive.removeprefix("max-age=")))
        except ValueError:
            return GOOGLE_JWKS_DEFAULT_TTL_SECONDS
    return GOOGLE_JWKS_DEFAULT_TTL_SECONDS


async def _google_jwks(*, force_refresh: bool = False) -> dict:
    global _google_jwks_cache

    now = time.time()
    if not force_refresh and _google_jwks_cache is not None:
        expires_at, cached_jwks = _google_jwks_cache
        if expires_at > now:
            return cached_jwks

    async with _get_google_jwks_lock():
        now = time.time()
        if not force_refresh and _google_jwks_cache is not None:
            expires_at, cached_jwks = _google_jwks_cache
            if expires_at > now:
                return cached_jwks

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(GOOGLE_JWKS_URL)
        response.raise_for_status()
        jwks = response.json()
        if not isinstance(jwks, dict) or not isinstance(jwks.get("keys"), list):
            raise jwt.InvalidTokenError("Invalid Google JWKS response")

        ttl = _cache_ttl_seconds(response.headers.get("cache-control", ""))
        _google_jwks_cache = (now + ttl, jwks)
        return jwks


def _get_google_jwks_lock() -> asyncio.Lock:
    global _google_jwks_lock
    if _google_jwks_lock is None:
        _google_jwks_lock = asyncio.Lock()
    return _google_jwks_lock


def _public_key_for_google_token(credential: str, jwks: dict):
    header = jwt.get_unverified_header(credential)
    if header.get("alg") not in GOOGLE_ID_TOKEN_ALGORITHMS:
        raise jwt.InvalidTokenError("Unsupported Google token algorithm")
    kid = header.get("kid")
    for jwk in jwks.get("keys", []):
        if jwk.get("kid") == kid:
            return RSAAlgorithm.from_jwk(json.dumps(jwk))
    raise jwt.InvalidTokenError("Google token signing key not found")


async def verify_google_token(credential: str, client_id: str) -> dict:
    if not client_id:
        raise jwt.InvalidAudienceError("Google client id is not configured")

    jwks = await _google_jwks()
    try:
        public_key = _public_key_for_google_token(credential, jwks)
    except jwt.InvalidTokenError:
        jwks = await _google_jwks(force_refresh=True)
        public_key = _public_key_for_google_token(credential, jwks)

    payload = jwt.decode(
        credential,
        public_key,
        algorithms=GOOGLE_ID_TOKEN_ALGORITHMS,
        audience=client_id,
        options={"require": ["aud", "exp", "iat", "iss", "sub"]},
    )
    if payload.get("iss") not in GOOGLE_ID_TOKEN_ISSUERS:
        raise jwt.InvalidIssuerError("Invalid Google token issuer")
    return payload
