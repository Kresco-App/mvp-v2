import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.users import User
from app.services.auth import decode_token


async def revoke_user_sessions(db: AsyncSession, user: User) -> None:
    user.auth_token_version = (user.auth_token_version or 0) + 1
    await db.commit()


async def revoke_cookie_session_if_valid(
    db: AsyncSession,
    *,
    token: str | None,
    settings: Settings,
) -> bool:
    if not token:
        return False

    try:
        payload = decode_token(token, settings)
    except jwt.PyJWTError:
        return False

    result = await db.execute(
        select(User).where(
            User.id == payload.user_id,
            User.is_active == True,  # noqa: E712
        )
    )
    user = result.scalar_one_or_none()
    if user is None:
        return False
    if (user.auth_token_version or 0) != payload.token_version:
        return False

    await revoke_user_sessions(db, user)
    return True
