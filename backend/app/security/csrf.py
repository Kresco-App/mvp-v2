from __future__ import annotations

import hmac
import re
import secrets
from urllib.parse import urlparse

import jwt
from fastapi import Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import Settings
from app.services.auth import AUTH_COOKIE_NAME, decode_token

CSRF_COOKIE_NAME = "kresco_csrf"
CSRF_HEADER_NAME = "x-csrf-token"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
UNAUTHENTICATED_AUTH_PATHS = {
    "/api/google-login",
    "/api/auth/signup",
    "/api/auth/verify-email",
    "/api/auth/resend-verification",
    "/api/auth/login",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/logout",
}
SIGNED_WEBHOOK_PATHS = {
    "/api/payments/webhook",
}


def csrf_token_for_user(user: object, settings: Settings) -> str:
    payload = {
        "user_id": int(getattr(user, "id")),
        "token_version": int(getattr(user, "auth_token_version", 0) or 0),
        "nonce": secrets.token_urlsafe(18),
    }
    return _serializer(settings).dumps(payload)


def set_csrf_cookie(response: Response, user: object, settings: Settings) -> str:
    token = csrf_token_for_user(user, settings)
    response.set_cookie(
        CSRF_COOKIE_NAME,
        token,
        max_age=max(int(settings.jwt_expire_minutes) * 60, 0),
        httponly=False,
        secure=settings.is_production_like,
        samesite="none" if settings.is_production_like else "lax",
        path="/",
    )
    return token


def clear_csrf_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        CSRF_COOKIE_NAME,
        path="/",
        secure=settings.is_production_like,
        httponly=False,
        samesite="none" if settings.is_production_like else "lax",
    )


def csrf_failure_reason(request: Request, settings: Settings) -> str | None:
    if request.method.upper() in SAFE_METHODS:
        return None
    if _is_exempt_path(request.url.path):
        return None
    if _is_admin_path(request.url.path):
        origin = _request_origin(request)
        if origin is None:
            return "CSRF origin is required for admin writes"
        if not _is_trusted_origin(origin, request, settings):
            return "CSRF origin is not trusted"
        return None
    if _uses_bearer_auth(request) and AUTH_COOKIE_NAME not in request.cookies:
        return None
    if AUTH_COOKIE_NAME not in request.cookies:
        return None

    origin = _request_origin(request)
    if origin is None:
        return "CSRF origin is required for cookie-authenticated writes"
    if not _is_trusted_origin(origin, request, settings):
        return "CSRF origin is not trusted"

    header_token = request.headers.get(CSRF_HEADER_NAME, "")
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME, "")
    if not header_token or not cookie_token:
        return "CSRF token is required for cookie-authenticated writes"
    if not hmac.compare_digest(header_token, cookie_token):
        return "CSRF token mismatch"

    try:
        auth_payload = decode_token(request.cookies[AUTH_COOKIE_NAME], settings)
        csrf_payload = _serializer(settings).loads(
            cookie_token,
            max_age=max(int(settings.jwt_expire_minutes) * 60, 1),
        )
    except (jwt.PyJWTError, BadSignature, SignatureExpired, TypeError, ValueError):
        return "CSRF token is invalid"

    if int(csrf_payload.get("user_id", 0)) != auth_payload.user_id:
        return "CSRF token user mismatch"
    if int(csrf_payload.get("token_version", -1)) != auth_payload.token_version:
        return "CSRF token session mismatch"
    return None


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.jwt_secret_key, salt="kresco-csrf-v1")


def _is_exempt_path(path: str) -> bool:
    return path in UNAUTHENTICATED_AUTH_PATHS or path in SIGNED_WEBHOOK_PATHS


def _is_admin_path(path: str) -> bool:
    return path == "/admin" or path.startswith("/admin/")


def _uses_bearer_auth(request: Request) -> bool:
    authorization = request.headers.get("authorization", "")
    return authorization.strip().lower().startswith("bearer ")


def _request_origin(request: Request) -> str | None:
    origin = request.headers.get("origin")
    if origin:
        return _normalize_origin(origin)

    referer = request.headers.get("referer")
    if referer:
        return _normalize_origin(referer)
    return None


def _normalize_origin(value: str) -> str | None:
    parsed = urlparse(value.strip())
    if not parsed.scheme or not parsed.hostname:
        return None
    port = f":{parsed.port}" if parsed.port is not None else ""
    return f"{parsed.scheme.lower()}://{parsed.hostname.lower()}{port}"


def _is_trusted_origin(origin: str, request: Request, settings: Settings) -> bool:
    trusted_origins = {
        item
        for item in (_normalize_origin(settings.frontend_url), _normalize_origin(str(request.base_url)))
        if item
    }
    trusted_origins.update(
        normalized
        for configured in settings.cors_origins_list
        if (normalized := _normalize_origin(configured))
    )
    if origin in trusted_origins:
        return True

    pattern = settings.cors_allow_origin_regex.strip()
    if not pattern:
        return False
    try:
        return re.fullmatch(pattern, origin) is not None
    except re.error:
        return False
