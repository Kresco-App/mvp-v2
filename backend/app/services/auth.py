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
GOOGLE_JWKS_FORCE_REFRESH_MIN_INTERVAL_SECONDS = 60
GOOGLE_ID_TOKEN_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
GOOGLE_ID_TOKEN_ALGORITHMS = ["RS256"]
FIREBASE_AUTH_APP_NAME_PREFIX = "kresco-auth-"

_google_jwks_cache: tuple[float, dict] | None = None
_google_jwks_cache_fingerprint: str | None = None
_google_jwks_lock: asyncio.Lock | None = None
_google_jwks_last_refresh_at = 0.0
_google_jwks_kid_miss_cache: dict[str, tuple[str, float]] = {}


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


def _google_jwks_fingerprint(jwks: dict) -> str:
    return json.dumps(jwks, sort_keys=True, separators=(",", ":"))


def _record_google_jwks_kid_miss(kid: str) -> None:
    fingerprint = _google_jwks_cache_fingerprint
    if fingerprint is None:
        return
    _google_jwks_kid_miss_cache[kid] = (fingerprint, time.time())
    while len(_google_jwks_kid_miss_cache) > 128:
        _google_jwks_kid_miss_cache.pop(next(iter(_google_jwks_kid_miss_cache)))


def _clear_google_jwks_kid_miss(kid: str) -> None:
    _google_jwks_kid_miss_cache.pop(kid, None)


def _should_force_refresh_google_jwks_for_kid(kid: str) -> bool:
    cached_miss = _google_jwks_kid_miss_cache.get(kid)
    if cached_miss is None:
        return True

    cached_fingerprint, recorded_at = cached_miss
    if cached_fingerprint != _google_jwks_cache_fingerprint:
        return True
    return time.time() - recorded_at >= GOOGLE_JWKS_FORCE_REFRESH_MIN_INTERVAL_SECONDS


async def _google_jwks_with_metadata(
    *,
    force_refresh: bool = False,
    respect_recent_refresh_throttle: bool = True,
) -> tuple[dict, bool]:
    global _google_jwks_cache, _google_jwks_cache_fingerprint, _google_jwks_last_refresh_at

    now = time.time()
    if not force_refresh and _google_jwks_cache is not None:
        expires_at, cached_jwks = _google_jwks_cache
        if expires_at > now:
            return cached_jwks, False

    async with _get_google_jwks_lock():
        now = time.time()
        if _google_jwks_cache is not None:
            expires_at, cached_jwks = _google_jwks_cache
            recently_refreshed = now - _google_jwks_last_refresh_at < GOOGLE_JWKS_FORCE_REFRESH_MIN_INTERVAL_SECONDS
            if expires_at > now and (
                not force_refresh or (respect_recent_refresh_throttle and recently_refreshed)
            ):
                return cached_jwks, False

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(GOOGLE_JWKS_URL)
        response.raise_for_status()
        jwks = response.json()
        if not isinstance(jwks, dict) or not isinstance(jwks.get("keys"), list):
            raise jwt.InvalidTokenError("Invalid Google JWKS response")

        ttl = _cache_ttl_seconds(response.headers.get("cache-control", ""))
        _google_jwks_cache = (now + ttl, jwks)
        _google_jwks_cache_fingerprint = _google_jwks_fingerprint(jwks)
        _google_jwks_last_refresh_at = now
        return jwks, True


async def _google_jwks(*, force_refresh: bool = False) -> dict:
    jwks, _ = await _google_jwks_with_metadata(force_refresh=force_refresh)
    return jwks


def _get_google_jwks_lock() -> asyncio.Lock:
    global _google_jwks_lock
    if _google_jwks_lock is None:
        _google_jwks_lock = asyncio.Lock()
    return _google_jwks_lock


def _google_token_key_id(credential: str) -> str:
    header = jwt.get_unverified_header(credential)
    if header.get("alg") not in GOOGLE_ID_TOKEN_ALGORITHMS:
        raise jwt.InvalidTokenError("Unsupported Google token algorithm")
    kid = header.get("kid")
    if not isinstance(kid, str) or not kid:
        raise jwt.InvalidTokenError("Google token signing key not found")
    return kid


def _public_key_for_google_kid(kid: str, jwks: dict):
    for jwk in jwks.get("keys", []):
        if jwk.get("kid") == kid:
            return RSAAlgorithm.from_jwk(json.dumps(jwk))
    raise jwt.InvalidTokenError("Google token signing key not found")


def _public_key_for_google_token(credential: str, jwks: dict):
    return _public_key_for_google_kid(_google_token_key_id(credential), jwks)


async def verify_google_token(credential: str, client_id: str) -> dict:
    if not client_id:
        raise jwt.InvalidAudienceError("Google client id is not configured")

    kid = _google_token_key_id(credential)
    jwks, fetched_initial_jwks = await _google_jwks_with_metadata()
    try:
        public_key = _public_key_for_google_kid(kid, jwks)
    except jwt.InvalidTokenError:
        if fetched_initial_jwks:
            _record_google_jwks_kid_miss(kid)
            raise
        if not _should_force_refresh_google_jwks_for_kid(kid):
            raise
        jwks, _ = await _google_jwks_with_metadata(
            force_refresh=True,
            respect_recent_refresh_throttle=False,
        )
        try:
            public_key = _public_key_for_google_kid(kid, jwks)
        except jwt.InvalidTokenError:
            _record_google_jwks_kid_miss(kid)
            raise

    _clear_google_jwks_kid_miss(kid)

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


def _firebase_google_subject(payload: dict) -> str:
    firebase_claim = payload.get("firebase")
    if not isinstance(firebase_claim, dict):
        raise jwt.InvalidTokenError("Firebase provider claim is missing")
    if firebase_claim.get("sign_in_provider") != "google.com":
        raise jwt.InvalidTokenError("Firebase credential is not a Google sign-in")

    identities = firebase_claim.get("identities")
    google_identities = identities.get("google.com") if isinstance(identities, dict) else None
    if isinstance(google_identities, list):
        for identity in google_identities:
            if isinstance(identity, str) and identity.strip():
                return identity.strip()
    raise jwt.InvalidTokenError("Firebase Google identity is missing")


def _google_login_payload_from_firebase(payload: dict) -> dict:
    firebase_uid = _firebase_string_claim(payload, "uid", "user_id", "sub")
    if not firebase_uid:
        raise jwt.InvalidTokenError("Firebase UID is missing")
    return {
        "email": payload.get("email"),
        "email_verified": payload.get("email_verified"),
        "name": payload.get("name") or "",
        "picture": payload.get("picture") or "",
        "sub": _firebase_google_subject(payload),
        "firebase_uid": firebase_uid,
    }


async def verify_firebase_token(credential: str, project_id: str) -> dict:
    from firebase_admin import auth as firebase_auth

    project_id = project_id.strip()
    if not project_id:
        raise jwt.InvalidAudienceError("Firebase project id is not configured")

    app = _firebase_auth_app(project_id)
    payload = await asyncio.to_thread(firebase_auth.verify_id_token, credential, app=app)
    return _google_login_payload_from_firebase(payload)
