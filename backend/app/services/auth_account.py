from datetime import datetime, timezone
from collections.abc import Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.users import User
from app.security.passwords import hash_password_async, is_unusable_password, verify_password_async
from app.services.email import verify_reset_token, verify_verification_token
from app.services.auth_users import get_user_by_email

RequireProfessorOffering = Callable[[AsyncSession, User], Awaitable[None]]


async def verify_email_account(
    db: AsyncSession,
    *,
    token: str,
    settings: Settings,
) -> User:
    verification = verify_verification_token(token, settings)
    if verification is None:
        raise HTTPException(status_code=400, detail="Lien de verification invalide ou expire")

    user = await get_user_by_email(db, verification.email)
    if user is None:
        raise HTTPException(status_code=404, detail="Compte introuvable")

    if (user.email_token_version or 0) != verification.token_version:
        raise HTTPException(status_code=400, detail="Lien de verification invalide ou expire")

    if not user.is_email_verified:
        user.is_email_verified = True
        user.email_token_version = (user.email_token_version or 0) + 1
        user.auth_token_version = (user.auth_token_version or 0) + 1
        await db.commit()
        await db.refresh(user)
    return user


async def authenticate_password_login(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    require_professor_active_offering_fn: RequireProfessorOffering,
) -> User:
    user = await get_user_by_email(db, email, active_only=True)

    if (
        user is None
        or is_unusable_password(user.password)
        or not await verify_password_async(password, user.password)
    ):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    if not user.is_email_verified:
        raise HTTPException(
            status_code=403,
            detail="Veuillez verifier votre email avant de vous connecter",
        )
    if user.role == "professor":
        await require_professor_active_offering_fn(db, user)
    return user


async def reset_password_account(
    db: AsyncSession,
    *,
    token: str,
    password: str,
    settings: Settings,
) -> None:
    reset_payload = verify_reset_token(token, settings)
    if reset_payload is None:
        raise HTTPException(status_code=400, detail="Lien de reinitialisation invalide ou expire")

    user = await get_user_by_email(db, reset_payload.email)
    if user is None:
        raise HTTPException(status_code=400, detail="Lien de reinitialisation invalide ou expire")
    if (user.email_token_version or 0) != reset_payload.token_version:
        raise HTTPException(status_code=400, detail="Lien de reinitialisation invalide ou expire")

    user.password = await hash_password_async(password)
    user.email_token_version = (user.email_token_version or 0) + 1
    user.auth_token_version = (user.auth_token_version or 0) + 1
    user.password_changed_at = datetime.now(timezone.utc)
    await db.commit()


async def revoke_user_sessions(db: AsyncSession, user: User) -> None:
    user.auth_token_version = (user.auth_token_version or 0) + 1
    await db.commit()
