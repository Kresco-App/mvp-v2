from __future__ import annotations

from datetime import datetime, timezone

import jwt
from fastapi import Request
from sqlalchemy import select
from sqladmin.authentication import AuthenticationBackend
from starlette.middleware import Middleware
from starlette.middleware.sessions import SessionMiddleware

from app.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.config import Settings
from app.security.csrf import AdminCSRFMiddleware
from app.models.users import User, UserPermission
from app.services.auth import AUTH_COOKIE_NAME, decode_token
from app.services.auth_users import get_user_by_email

ADMIN_SESSION_AUTHENTICATED = "admin_authenticated"
ADMIN_SESSION_USER_ID = "admin_user_id"
ADMIN_SESSION_TOKEN_VERSION = "admin_token_version"


def _client_host(request: Request) -> str:
    return request.client.host if request.client else ""


def _request_path(request: Request) -> str:
    return str(request.url.path)


async def _write_admin_auth_audit(
    request: Request,
    *,
    action: str,
    user: User | None = None,
    email: str = "",
    success: bool,
    reason: str = "",
) -> None:
    session_factory = get_session_factory()
    if session_factory is None:
        return

    object_pk = str(user.id) if user is not None else ""
    object_repr = user.email if user is not None else email
    note = f"admin_user_id={user.id}" if user is not None else "admin_user_id=unknown"
    changed_data = {"success": success}
    if email:
        changed_data["email"] = email
    if reason:
        changed_data["reason"] = reason

    async with session_factory() as db:
        db.add(AdminAuditLog(
            action=action,
            model_name="User",
            object_pk=object_pk,
            object_repr=object_repr[:500],
            changed_data=changed_data,
            request_path=_request_path(request),
            client_host=_client_host(request),
            note=note,
        ))
        await db.commit()


async def _has_sqladmin_access(db, user: User) -> bool:
    if user.is_superuser:
        return True
    result = await db.execute(
        select(UserPermission.id)
        .where(
            UserPermission.user_id == int(user.id),
            UserPermission.permission == "sqladmin:access",
            UserPermission.status == "active",
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


def _store_admin_session(request: Request, user: User) -> None:
    request.session[ADMIN_SESSION_AUTHENTICATED] = True
    request.session[ADMIN_SESSION_USER_ID] = user.id
    request.session[ADMIN_SESSION_TOKEN_VERSION] = user.auth_token_version or 0


async def _firebase_backed_admin_user(request: Request, settings: Settings) -> tuple[User | None, str]:
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        return None, "firebase_session_required"
    try:
        token_payload = decode_token(token, settings)
    except jwt.PyJWTError:
        return None, "invalid_firebase_session"

    session_factory = get_session_factory()
    if session_factory is None:
        return None, "database_unavailable"

    async with session_factory() as db:
        result = await db.execute(
            select(User).where(
                User.id == token_payload.user_id,
                User.is_active == True,  # noqa: E712
            )
        )
        user = result.scalar_one_or_none()
        if user is None:
            return None, "user_not_found"
        if (user.auth_token_version or 0) != token_payload.token_version:
            return user, "token_revoked"
        if not user.is_email_verified or not user.is_staff:
            return user, "invalid_credentials_or_staff_boundary"
        if not await _has_sqladmin_access(db, user):
            return user, "sqladmin_access_required"
        return user, ""


class StaffAdminAuth(AuthenticationBackend):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.middlewares = [
            Middleware(
                SessionMiddleware,
                secret_key=settings.jwt_secret_key,
                max_age=86400,
                same_site="lax",
                https_only=settings.is_production_like,
            ),
            Middleware(AdminCSRFMiddleware, settings=settings),
        ]

    async def login(self, request: Request) -> bool:
        form = await request.form()
        email = str(form.get("username") or "").strip().lower()
        user, reason = await _firebase_backed_admin_user(request, self.settings)
        if user is None and email:
            session_factory = get_session_factory()
            if session_factory is not None:
                async with session_factory() as db:
                    user = await get_user_by_email(db, email)
        if user is None:
            await _write_admin_auth_audit(
                request,
                action="admin_login",
                email=email,
                success=False,
                reason=reason,
            )
            return False
        if reason:
            await _write_admin_auth_audit(
                request,
                action="admin_login",
                user=user,
                email=email or user.email,
                success=False,
                reason=reason,
            )
            return False

        session_factory = get_session_factory()
        if session_factory is not None:
            async with session_factory() as db:
                db_user = await db.get(User, int(user.id))
                if db_user is not None:
                    db_user.last_login = datetime.now(timezone.utc)
                    await db.commit()

        _store_admin_session(request, user)
        await _write_admin_auth_audit(
            request,
            action="admin_login",
            user=user,
            email=email or user.email,
            success=True,
        )
        return True

    async def logout(self, request: Request) -> bool:
        user = await self._session_user(request)
        await _write_admin_auth_audit(
            request,
            action="admin_logout",
            user=user,
            email=user.email if user else "",
            success=True,
        )
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        user = await self._session_user(request)
        if user is not None:
            return True

        user, reason = await _firebase_backed_admin_user(request, self.settings)
        if user is not None and not reason:
            _store_admin_session(request, user)
            return True

        request.session.clear()
        return False

    async def _session_user(self, request: Request) -> User | None:
        if not request.session.get(ADMIN_SESSION_AUTHENTICATED):
            return None

        try:
            user_id = int(request.session.get(ADMIN_SESSION_USER_ID, 0))
            session_token_version = int(request.session.get(ADMIN_SESSION_TOKEN_VERSION, -1))
        except (TypeError, ValueError):
            return None
        if user_id <= 0 or session_token_version < 0:
            return None

        session_factory = get_session_factory()
        if session_factory is None:
            return None

        async with session_factory() as db:
            result = await db.execute(
                select(User).where(
                    User.id == user_id,
                    User.is_active == True,  # noqa: E712
                    User.is_email_verified == True,  # noqa: E712
                    User.is_staff == True,  # noqa: E712
                )
            )
            user = result.scalar_one_or_none()
            if user is None:
                return None
            if (user.auth_token_version or 0) != session_token_version:
                return None
            if not await _has_sqladmin_access(db, user):
                return None
            return user
