import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import UserXP
from app.models.users import User
from app.security.passwords import is_unusable_password, make_unusable_password
from app.services.auth_users import get_user_by_email, normalize_email, require_user_by_email

logger = logging.getLogger("kresco.auth")
RequireProfessorOffering = Callable[[AsyncSession, User], Awaitable[None]]


def _google_payload_fields(payload: dict) -> tuple[str, str, str, str]:
    raw_email = payload.get("email", "")
    if not isinstance(raw_email, str):
        raise HTTPException(status_code=401, detail="Invalid Google credential")
    email = normalize_email(raw_email)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid Google credential")
    if payload.get("email_verified") is not True:
        raise HTTPException(status_code=401, detail="Invalid Google credential")
    google_id = payload.get("sub", "")
    if not isinstance(google_id, str) or not google_id.strip():
        raise HTTPException(status_code=401, detail="Invalid Google credential")
    full_name = payload.get("name", "")
    avatar_url = payload.get("picture", "")
    if not isinstance(full_name, str):
        full_name = ""
    if not isinstance(avatar_url, str):
        avatar_url = ""
    return email, full_name, avatar_url, google_id


async def _merge_google_profile(
    db: AsyncSession,
    user: User,
    *,
    full_name: str,
    avatar_url: str,
    google_id: str,
    require_professor_active_offering_fn: RequireProfessorOffering,
) -> User:
    if user.role == "professor":
        await require_professor_active_offering_fn(db, user)

    changed = False
    if not user.is_email_verified:
        user.is_email_verified = True
        user.email_token_version = (user.email_token_version or 0) + 1
        user.auth_token_version = (user.auth_token_version or 0) + 1
        if not is_unusable_password(user.password):
            user.password = make_unusable_password()
            user.password_changed_at = datetime.now(timezone.utc)
        changed = True
    if user.google_id != google_id:
        user.google_id = google_id
        changed = True
    if avatar_url and user.avatar_url != avatar_url:
        user.avatar_url = avatar_url
        changed = True
    if not user.full_name and full_name:
        user.full_name = full_name
        changed = True
    if changed:
        try:
            await db.commit()
            await db.refresh(user)
        except Exception as exc:
            await db.rollback()
            logger.exception("google_login_persistence_failed")
            raise HTTPException(status_code=503, detail="Could not complete Google login.") from exc
    return user


async def _reselect_google_user(db: AsyncSession, email: str) -> User:
    return await require_user_by_email(db, email, detail="Could not complete Google login.")


async def complete_google_login(
    db: AsyncSession,
    *,
    payload: dict,
    require_professor_active_offering_fn: RequireProfessorOffering,
) -> User:
    email, full_name, avatar_url, google_id = _google_payload_fields(payload)

    user = await get_user_by_email(db, email)

    if user is None:
        user = User(
            email=email,
            full_name=full_name,
            avatar_url=avatar_url,
            google_id=google_id,
            is_email_verified=True,
        )
        try:
            db.add(user)
            await db.flush()
            db.add(UserXP(user_id=user.id, total_xp=0, streak_days=0))
            await db.commit()
            await db.refresh(user)
            return user
        except IntegrityError:
            await db.rollback()
            user = await _reselect_google_user(db, email)
        except Exception as exc:
            await db.rollback()
            logger.exception("google_login_persistence_failed")
            raise HTTPException(status_code=503, detail="Could not complete Google login.") from exc

    return await _merge_google_profile(
        db,
        user,
        full_name=full_name,
        avatar_url=avatar_url,
        google_id=google_id,
        require_professor_active_offering_fn=require_professor_active_offering_fn,
    )
