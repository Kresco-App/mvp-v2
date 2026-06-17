from __future__ import annotations

import hmac
import re
import secrets
from urllib.parse import urlparse

import jwt
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import Settings
from app.services.auth import AUTH_COOKIE_NAME, decode_token

CSRF_COOKIE_NAME = "kresco_csrf"
CSRF_HEADER_NAME = "x-csrf-token"
ADMIN_CSRF_COOKIE_NAME = "kresco_admin_csrf"
ADMIN_CSRF_FIELD_NAME = "kresco_admin_csrf"
ADMIN_CSRF_SESSION_KEY = "admin_csrf_token"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
UNAUTHENTICATED_AUTH_PATHS = {
    "/api/google-login",
    "/api/auth/signup",
    "/api/auth/verify-email",
    "/api/auth/resend-verification",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/client-errors",
}
SIGNED_WEBHOOK_PATHS = {
    "/api/payments/cmi/callback",
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
        samesite=settings.auth_cookie_samesite_value,
        path="/",
    )
    return token


def clear_csrf_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        CSRF_COOKIE_NAME,
        path="/",
        secure=settings.is_production_like,
        httponly=False,
        samesite=settings.auth_cookie_samesite_value,
    )


def csrf_failure_reason(request: Request, settings: Settings) -> str | None:
    if request.method.upper() in SAFE_METHODS:
        return None
    if _is_exempt_path(request.url.path):
        origin = _request_origin(request)
        if origin is not None and not _is_trusted_origin(origin, request, settings):
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


class AdminCSRFMiddleware:
    def __init__(self, app: ASGIApp, *, settings: Settings) -> None:
        self.app = app
        self.settings = settings

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = str(scope.get("method", "GET")).upper()
        if method in SAFE_METHODS:
            session = _admin_session(scope)
            if session is not None:
                _ensure_admin_csrf_token(session)
            await self.app(scope, receive, self._send_with_admin_csrf_cookie(scope, send))
            return

        request = Request(scope, receive=receive)
        origin = _request_origin(request)
        if origin is None:
            await _admin_csrf_forbidden(scope, receive, send, "CSRF origin is required for admin writes")
            return
        if not _is_trusted_origin(origin, request, self.settings):
            await _admin_csrf_forbidden(scope, receive, send, "CSRF origin is not trusted")
            return

        body = await _read_request_body(receive)
        session = _admin_session(scope)
        expected_token = str(session.get(ADMIN_CSRF_SESSION_KEY) or "") if session is not None else ""
        submitted_token = request.headers.get(CSRF_HEADER_NAME, "")
        if not submitted_token:
            submitted_token = await _form_csrf_token(scope, body)

        if not expected_token or not submitted_token:
            await _admin_csrf_forbidden(scope, _replay_body(body), send, "Admin CSRF token is required")
            return
        if not hmac.compare_digest(expected_token, submitted_token):
            await _admin_csrf_forbidden(scope, _replay_body(body), send, "Admin CSRF token mismatch")
            return

        await self.app(scope, _replay_body(body), self._send_with_admin_csrf_cookie(scope, send))

    def _send_with_admin_csrf_cookie(self, scope: Scope, send: Send) -> Send:
        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                session = _admin_session(scope)
                token = str(session.get(ADMIN_CSRF_SESSION_KEY) or "") if session is not None else ""
                response = Response()
                if token:
                    response.set_cookie(
                        ADMIN_CSRF_COOKIE_NAME,
                        token,
                        httponly=False,
                        secure=self.settings.is_production_like,
                        samesite="lax",
                        path="/",
                    )
                else:
                    response.delete_cookie(
                        ADMIN_CSRF_COOKIE_NAME,
                        path="/",
                        secure=self.settings.is_production_like,
                        httponly=False,
                        samesite="lax",
                    )
                headers = MutableHeaders(scope=message)
                for key, value in response.raw_headers:
                    headers.append(key.decode("latin1"), value.decode("latin1"))
            await send(message)

        return send_wrapper


def _admin_session(scope: Scope) -> dict | None:
    session = scope.get("session")
    return session if isinstance(session, dict) else None


def _ensure_admin_csrf_token(session: dict) -> str:
    token = str(session.get(ADMIN_CSRF_SESSION_KEY) or "")
    if not token:
        token = secrets.token_urlsafe(32)
        session[ADMIN_CSRF_SESSION_KEY] = token
    return token


async def _read_request_body(receive: Receive) -> bytes:
    chunks: list[bytes] = []
    while True:
        message = await receive()
        if message["type"] == "http.disconnect":
            break
        chunks.append(message.get("body", b""))
        if not message.get("more_body", False):
            break
    return b"".join(chunks)


def _replay_body(body: bytes) -> Receive:
    sent = False

    async def receive() -> Message:
        nonlocal sent
        if sent:
            return {"type": "http.request", "body": b"", "more_body": False}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return receive


async def _form_csrf_token(scope: Scope, body: bytes) -> str:
    request = Request(scope, receive=_replay_body(body))
    try:
        form = await request.form()
    except Exception:
        return ""
    return str(form.get(ADMIN_CSRF_FIELD_NAME) or "")


async def _admin_csrf_forbidden(scope: Scope, receive: Receive, send: Send, reason: str) -> None:
    response = JSONResponse(status_code=403, content={"detail": reason})
    await response(scope, receive, send)
