import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import UserXP
from app.models.users import User
from app.security.passwords import is_unusable_password, make_unusable_password
from app.services.auth_users import get_user_by_email, normalize_email, require_user_by_email

logger = logging.getLogger("kresco.auth")
RequireProfessorOffering = Callable[[AsyncSession, User], Awaitable[None]]


def _google_payload_fields(payload: dict) -> tuple[str, str, str, str, str | None]:
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
    firebase_uid = payload.get("firebase_uid")
    if firebase_uid is not None:
        if not isinstance(firebase_uid, str) or not firebase_uid.strip():
            raise HTTPException(status_code=401, detail="Invalid Google credential")
        firebase_uid = firebase_uid.strip()
    return email, full_name, avatar_url, google_id.strip(), firebase_uid


async def _merge_google_profile(
    db: AsyncSession,
    user: User,
    *,
    email: str,
    full_name: str,
    avatar_url: str,
    google_id: str,
    firebase_uid: str | None,
    require_professor_active_offering_fn: RequireProfessorOffering,
) -> User:
    if user.role == "professor":
        await require_professor_active_offering_fn(db, user)

    changed = False
    if user.email != normalize_email(user.email):
        user.email = normalize_email(user.email)
        changed = True
    payload_email = normalize_email(email)
    if not user.is_email_verified:
        user.is_email_verified = True
        user.email_token_version = (user.email_token_version or 0) + 1
        user.auth_token_version = (user.auth_token_version or 0) + 1
        if not is_unusable_password(user.password):
            user.password = make_unusable_password()
            user.password_changed_at = datetime.now(timezone.utc)
        changed = True
    if payload_email and user.email != payload_email:
        user.email = payload_email
        changed = True
    if user.google_id != google_id:
        user.google_id = google_id
        changed = True
    if firebase_uid and user.firebase_uid != firebase_uid:
        user.firebase_uid = firebase_uid
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


async def _reselect_google_user(
    db: AsyncSession,
    *,
    email: str,
    google_id: str,
    firebase_uid: str | None,
) -> User:
    user = await _find_google_login_user(db, email=email, google_id=google_id, firebase_uid=firebase_uid)
    if user is not None:
        return user
    return await require_user_by_email(db, email, detail="Could not complete Google login.")


async def _get_user_by_google_id(db: AsyncSession, google_id: str) -> User | None:
    result = await db.execute(select(User).where(User.google_id == google_id))
    return result.scalar_one_or_none()


async def _get_user_by_firebase_uid(db: AsyncSession, firebase_uid: str) -> User | None:
    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    return result.scalar_one_or_none()


async def _find_google_login_user(
    db: AsyncSession,
    *,
    email: str,
    google_id: str,
    firebase_uid: str | None,
) -> User | None:
    candidates: list[User] = []
    if firebase_uid:
        user = await _get_user_by_firebase_uid(db, firebase_uid)
        if user is not None:
            candidates.append(user)
    user = await _get_user_by_google_id(db, google_id)
    if user is not None and all(candidate.id != user.id for candidate in candidates):
        candidates.append(user)
    user = await get_user_by_email(db, email)
    if user is not None and all(candidate.id != user.id for candidate in candidates):
        candidates.append(user)

    if len(candidates) > 1:
        raise HTTPException(status_code=409, detail="Could not complete Google login.")
    return candidates[0] if candidates else None


async def complete_google_login(
    db: AsyncSession,
    *,
    payload: dict,
    require_professor_active_offering_fn: RequireProfessorOffering,
) -> User:
    email, full_name, avatar_url, google_id, firebase_uid = _google_payload_fields(payload)

    user = await _find_google_login_user(
        db,
        email=email,
        google_id=google_id,
        firebase_uid=firebase_uid,
    )

    if user is None:
        user = User(
            email=email,
            full_name=full_name,
            avatar_url=avatar_url,
            google_id=google_id,
            firebase_uid=firebase_uid,
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
            user = await _reselect_google_user(
                db,
                email=email,
                google_id=google_id,
                firebase_uid=firebase_uid,
            )
        except Exception as exc:
            await db.rollback()
            logger.exception("google_login_persistence_failed")
            raise HTTPException(status_code=503, detail="Could not complete Google login.") from exc

    return await _merge_google_profile(
        db,
        user,
        email=email,
        full_name=full_name,
        avatar_url=avatar_url,
        google_id=google_id,
        firebase_uid=firebase_uid,
        require_professor_active_offering_fn=require_professor_active_offering_fn,
    )
