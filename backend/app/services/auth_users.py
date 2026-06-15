from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.users import User


def normalize_email(email: str) -> str:
    return email.lower().strip()


async def get_user_by_email(
    db: AsyncSession,
    email: str,
    *,
    active_only: bool = False,
) -> User | None:
    filters = [User.email == normalize_email(email)]
    if active_only:
        filters.append(User.is_active == True)  # noqa: E712
    result = await db.execute(select(User).where(*filters))
    return result.scalar_one_or_none()


async def require_user_by_email(
    db: AsyncSession,
    email: str,
    *,
    detail: str,
    status_code: int = 503,
    active_only: bool = False,
) -> User:
    user = await get_user_by_email(db, email, active_only=active_only)
    if user is None:
        raise HTTPException(status_code=status_code, detail=detail)
    return user
