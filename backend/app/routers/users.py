import hashlib
import hmac
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db, require_professor_active_offering
from app.models.gamification import UserXP
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.users import (
    ForgotPasswordIn, GoogleLoginIn, LoginIn, MessageOut, ResendVerificationIn,
    ProfileMediaOut, ResetPasswordIn, SignupIn, SignupPendingOut, TokenOut, UserOut, UserUpdateIn,
    VerifyEmailIn,
)
from app.services.auth import AUTH_COOKIE_NAME, AUTH_ROLE_COOKIE_NAME, create_token, verify_google_token
from app.services.email import (
    generate_reset_token, generate_verification_token,
    send_reset_email, send_verification_email,
    verify_reset_token, verify_verification_token,
)

router = APIRouter(tags=["Auth & Users"])
logger = logging.getLogger("kresco.auth")

ALLOWED_PROFILE_MEDIA_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_PROFILE_MEDIA_BYTES = 5 * 1024 * 1024


def _hash_password(plain: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt, 260_000)
    return salt.hex() + ":" + dk.hex()


def _verify_password(plain: str, stored: str) -> bool:
    try:
        salt_hex, dk_hex = stored.split(":")
        salt = bytes.fromhex(salt_hex)
        dk = bytes.fromhex(dk_hex)
        new_dk = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt, 260_000)
        return hmac.compare_digest(dk, new_dk)
    except Exception:
        return False


def _auth_cookie_secure(settings: Settings) -> bool:
    return settings.is_production_like


def _set_auth_cookies(response: Response, token: str, user: User, settings: Settings) -> None:
    max_age = max(int(settings.jwt_expire_minutes) * 60, 0)
    secure = _auth_cookie_secure(settings)
    response.set_cookie(
        AUTH_COOKIE_NAME,
        token,
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        AUTH_ROLE_COOKIE_NAME,
        user.role or "",
        max_age=max_age,
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
    )


def _clear_auth_cookies(response: Response, settings: Settings) -> None:
    secure = _auth_cookie_secure(settings)
    response.delete_cookie(
        AUTH_COOKIE_NAME,
        path="/",
        secure=secure,
        httponly=True,
        samesite="lax",
    )
    response.delete_cookie(
        AUTH_ROLE_COOKIE_NAME,
        path="/",
        secure=secure,
        httponly=False,
        samesite="lax",
    )


@router.post("/google-login", response_model=TokenOut)
async def google_login(
    body: GoogleLoginIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    try:
        payload = await run_in_threadpool(verify_google_token, body.credential, settings.google_client_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google credential")

    email = payload.get("email", "")
    full_name = payload.get("name", "")
    avatar_url = payload.get("picture", "")
    google_id = payload.get("sub", "")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            email=email, full_name=full_name, avatar_url=avatar_url,
            google_id=google_id, is_email_verified=True,
        )
        db.add(user)
        await db.flush()
        db.add(UserXP(user_id=user.id, total_xp=0, streak_days=0))
        await db.commit()
        await db.refresh(user)
    else:
        if user.role == "professor":
            await require_professor_active_offering(db, user)

        changed = False
        if not user.is_email_verified:
            user.is_email_verified = True
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
                logger.exception("google_login_persistence_failed email=%s", email)
                raise HTTPException(status_code=503, detail="Could not complete Google login.") from exc

    token = create_token(user, settings)
    _set_auth_cookies(response, token, user, settings)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/auth/signup", response_model=SignupPendingOut, status_code=202)
@limiter.limit("3/minute")
async def signup(
    request: Request,
    body: SignupIn,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 6 caracteres")

    email = body.email.lower().strip()
    result = await db.execute(select(User).where(User.email == email))
    existing = result.scalar_one_or_none()

    if existing is not None:
        if existing.is_email_verified:
            raise HTTPException(status_code=409, detail="Un compte existe deja avec cet email")
        # Email squatting: unverified record — overwrite it so real owner can claim
        existing.full_name = body.full_name
        existing.password = _hash_password(body.password)
        await db.commit()
        await db.refresh(existing)
        user = existing
    else:
        user = User(
            email=email, full_name=body.full_name,
            password=_hash_password(body.password), is_email_verified=False,
        )
        db.add(user)
        await db.flush()
        db.add(UserXP(user_id=user.id, total_xp=0, streak_days=0))
        await db.commit()
        await db.refresh(user)

    token = generate_verification_token(email, settings)
    try:
        await send_verification_email(email, body.full_name, token, settings)
    except Exception:
        pass  # Don't block signup if email fails; user can request resend

    return SignupPendingOut(
        message="Un email de verification a ete envoye a votre adresse.",
        email=email,
    )


@router.post("/auth/verify-email", response_model=TokenOut)
async def verify_email(
    body: VerifyEmailIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    email = verify_verification_token(body.token, settings)
    if email is None:
        raise HTTPException(status_code=400, detail="Lien de verification invalide ou expire")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Compte introuvable")

    if user.role == "professor":
        await require_professor_active_offering(db, user)

    if not user.is_email_verified:
        user.is_email_verified = True
        await db.commit()
        await db.refresh(user)

    token = create_token(user, settings)
    _set_auth_cookies(response, token, user, settings)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/auth/resend-verification", response_model=MessageOut)
@limiter.limit("3/minute")
async def resend_verification(
    request: Request,
    body: ResendVerificationIn,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    email = body.email.lower().strip()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user and not user.is_email_verified:
        token = generate_verification_token(email, settings)
        try:
            await send_verification_email(email, user.full_name, token, settings)
        except Exception:
            pass

    # Always return success to avoid email enumeration
    return MessageOut(message="Si ce compte existe et n'est pas verifie, un email a ete envoye.")


@router.post("/auth/login", response_model=TokenOut)
@limiter.limit("5/minute")
async def login(
    request: Request,
    body: LoginIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    result = await db.execute(
        select(User).where(User.email == body.email.lower(), User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()

    if user is None or user.password == "!" or not _verify_password(body.password, user.password):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    if not user.is_email_verified:
        raise HTTPException(
            status_code=403,
            detail="Veuillez verifier votre email avant de vous connecter",
        )
    if user.role == "professor":
        await require_professor_active_offering(db, user)

    token = create_token(user, settings)
    _set_auth_cookies(response, token, user, settings)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/auth/logout", response_model=MessageOut)
async def logout(
    response: Response,
    settings: Settings = Depends(get_settings),
):
    _clear_auth_cookies(response, settings)
    return MessageOut(message="Deconnecte.")


@router.post("/auth/forgot-password", response_model=MessageOut)
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    body: ForgotPasswordIn,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    email = body.email.lower().strip()
    result = await db.execute(
        select(User).where(User.email == email, User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()

    if user and user.is_email_verified and user.password != "!":
        token = generate_reset_token(email, settings, token_version=user.auth_token_version or 0)
        try:
            await send_reset_email(email, token, settings)
        except Exception:
            pass

    # Always return success to avoid email enumeration
    return MessageOut(message="Si ce compte existe, vous recevrez un email de reinitialisation.")


@router.post("/auth/reset-password", response_model=MessageOut)
async def reset_password(
    body: ResetPasswordIn,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 6 caracteres")

    reset_payload = verify_reset_token(body.token, settings)
    if reset_payload is None:
        raise HTTPException(status_code=400, detail="Lien de reinitialisation invalide ou expire")

    result = await db.execute(select(User).where(User.email == reset_payload.email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    if (user.auth_token_version or 0) != reset_payload.token_version:
        raise HTTPException(status_code=400, detail="Lien de reinitialisation invalide ou expire")

    user.password = _hash_password(body.password)
    user.auth_token_version = (user.auth_token_version or 0) + 1
    user.password_changed_at = datetime.now(timezone.utc)
    await db.commit()
    return MessageOut(message="Mot de passe reinitialise avec succes.")


@router.get("/profile/me", response_model=UserOut)
async def get_profile(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


@router.patch("/profile/me", response_model=UserOut)
async def update_profile(
    body: UserUpdateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return UserOut.model_validate(user)
    for field, value in updates.items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/profile/me/media/{kind}", response_model=ProfileMediaOut)
async def upload_profile_media(
    kind: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if kind not in {"avatar", "banner"}:
        raise HTTPException(status_code=404, detail="Unsupported profile media type")

    extension = ALLOWED_PROFILE_MEDIA_TYPES.get(file.content_type or "")
    if extension is None:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG, WEBP, or GIF image")

    content = await file.read(MAX_PROFILE_MEDIA_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Upload a non-empty image")
    if len(content) > MAX_PROFILE_MEDIA_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 5 MB or smaller")

    media_root = Path("media") / "profile" / str(user.id)
    media_root.mkdir(parents=True, exist_ok=True)
    filename = f"{kind}-{uuid.uuid4().hex}{extension}"
    path = media_root / filename
    path.write_bytes(content)

    url = f"/media/profile/{user.id}/{filename}"
    if kind == "avatar":
        user.avatar_url = url
    else:
        user.banner_url = url

    await db.commit()
    await db.refresh(user)
    return ProfileMediaOut(url=url)
