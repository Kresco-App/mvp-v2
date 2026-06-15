from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqladmin.authentication import AuthenticationBackend
from starlette.middleware import Middleware
from starlette.middleware.sessions import SessionMiddleware

from app.database import get_session_factory
from app.models.admin_audit import AdminAuditLog
from app.config import Settings
from app.security.csrf import AdminCSRFMiddleware
from app.models.users import User, UserPermission
from app.services.auth_account import authenticate_password_login
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


async def _skip_professor_offering_check(_db, _user) -> None:
    return None


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


class StaffAdminAuth(AuthenticationBackend):
    def __init__(self, settings: Settings) -> None:
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
        password = str(form.get("password") or "")

        if not email or not password:
            await _write_admin_auth_audit(
                request,
                action="admin_login",
                email=email,
                success=False,
                reason="missing_credentials",
            )
            return False

        session_factory = get_session_factory()
        if session_factory is None:
            await _write_admin_auth_audit(
                request,
                action="admin_login",
                email=email,
                success=False,
                reason="database_unavailable",
            )
            return False

        async with session_factory() as db:
            user_for_audit = await get_user_by_email(db, email)
            try:
                user = await authenticate_password_login(
                    db,
                    email=email,
                    password=password,
                    require_professor_active_offering_fn=_skip_professor_offering_check,
                )
            except HTTPException:
                await _write_admin_auth_audit(
                    request,
                    action="admin_login",
                    user=user_for_audit,
                    email=email,
                    success=False,
                    reason="invalid_credentials_or_staff_boundary",
                )
                return False
            if not user.is_staff:
                await _write_admin_auth_audit(
                    request,
                    action="admin_login",
                    user=user,
                    email=email,
                    success=False,
                    reason="invalid_credentials_or_staff_boundary",
                )
                return False
            if not await _has_sqladmin_access(db, user):
                await _write_admin_auth_audit(
                    request,
                    action="admin_login",
                    user=user,
                    email=email,
                    success=False,
                    reason="sqladmin_access_required",
                )
                return False

            user.last_login = datetime.now(timezone.utc)
            await db.commit()
            request.session[ADMIN_SESSION_AUTHENTICATED] = True
            request.session[ADMIN_SESSION_USER_ID] = user.id
            request.session[ADMIN_SESSION_TOKEN_VERSION] = user.auth_token_version or 0
            await _write_admin_auth_audit(
                request,
                action="admin_login",
                user=user,
                email=email,
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
        if user is None:
            request.session.clear()
            return False
        return True

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
