from typing import AsyncGenerator

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import get_session_factory
from app.models.professor import CourseOffering
from app.models.users import User
from app.services.auth import AUTH_COOKIE_NAME, decode_token

_bearer = HTTPBearer(auto_error=False)


async def get_db(request: Request) -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    if factory is None:
        raise RuntimeError("Database not initialized. Call init_engine() first.")
    async with factory() as session:
        try:
            yield session
        except BaseException:
            await session.rollback()
            raise


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    token = credentials.credentials if credentials is not None else request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication token missing")
    try:
        token_payload = decode_token(token, settings)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(
        select(User).where(User.id == token_payload.user_id, User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    if (user.auth_token_version or 0) != token_payload.token_version:
        raise HTTPException(status_code=401, detail="Token revoked")
    return user


async def get_current_staff_user(
    user: User = Depends(get_current_user),
) -> User:
    if not user.is_staff:
        raise HTTPException(status_code=403, detail="Staff access required")
    return user


async def get_current_professor_user(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    if user.role != "professor":
        raise HTTPException(status_code=403, detail="Professor access required")
    if not user.is_email_verified:
        raise HTTPException(status_code=403, detail="Verified professor account required")
    await require_professor_active_offering(db, user)
    return user


async def professor_has_active_offering(db: AsyncSession, user: User) -> bool:
    if user.role != "professor":
        return False

    offering_id = await db.scalar(
        select(CourseOffering.id)
        .where(
            CourseOffering.professor_user_id == user.id,
            CourseOffering.status == "active",
        )
        .limit(1)
    )
    return offering_id is not None


async def require_professor_active_offering(db: AsyncSession, user: User) -> None:
    if not await professor_has_active_offering(db, user):
        raise HTTPException(status_code=403, detail="Active course offering assignment required")
