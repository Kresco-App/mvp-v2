from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gamification import UserXP
from app.models.users import User
from app.security.passwords import hash_password_async


def _normalize_email(email: str) -> str:
    return email.lower().strip()


async def _apply_unverified_signup_reclaim(
    user: User,
    *,
    full_name: str,
    plain_password: str,
) -> None:
    user.full_name = full_name
    user.password = await hash_password_async(plain_password)
    user.auth_token_version = (user.auth_token_version or 0) + 1
    user.password_changed_at = datetime.now(timezone.utc)


async def _reclaim_unverified_user(
    db: AsyncSession,
    user: User,
    *,
    full_name: str,
    plain_password: str,
) -> User:
    if user.is_email_verified:
        raise HTTPException(status_code=409, detail="Un compte existe deja avec cet email")

    # Rotate account state so stale verification links cannot activate a reclaimed account.
    await _apply_unverified_signup_reclaim(user, full_name=full_name, plain_password=plain_password)
    try:
        await db.commit()
        await db.refresh(user)
        return user
    except IntegrityError:
        await db.rollback()
        raise


async def _reselect_signup_user(db: AsyncSession, email: str) -> User:
    result = await db.execute(select(User).where(User.email == _normalize_email(email)))
    existing = result.scalar_one_or_none()
    if existing is None:
        raise HTTPException(status_code=503, detail="Could not complete signup.")
    return existing


async def create_or_reclaim_signup_user(
    db: AsyncSession,
    *,
    email: str,
    full_name: str,
    plain_password: str,
) -> User:
    normalized_email = _normalize_email(email)
    result = await db.execute(select(User).where(User.email == normalized_email))
    existing = result.scalar_one_or_none()

    if existing is not None:
        try:
            return await _reclaim_unverified_user(
                db,
                existing,
                full_name=full_name,
                plain_password=plain_password,
            )
        except IntegrityError:
            existing = await _reselect_signup_user(db, email)
            return await _reclaim_unverified_user(
                db,
                existing,
                full_name=full_name,
                plain_password=plain_password,
            )

    user = User(
        email=normalized_email,
        full_name=full_name,
        password=await hash_password_async(plain_password),
        is_email_verified=False,
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
        existing = await _reselect_signup_user(db, email)
        return await _reclaim_unverified_user(
            db,
            existing,
            full_name=full_name,
            plain_password=plain_password,
        )
