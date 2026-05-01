import hashlib
import hmac
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request

logger = logging.getLogger(__name__)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db
from app.models.gamification import UserXP
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.users import (
    ForgotPasswordIn, GoogleLoginIn, LoginIn, MessageOut, ResendVerificationIn,
    ResetPasswordIn, SignupIn, SignupPendingOut, TokenOut, UserOut, UserUpdateIn,
    VerifyEmailIn,
)
from app.services.auth import create_token, verify_google_token
from app.services.email import (
    generate_reset_token, generate_verification_token,
    send_reset_email, send_verification_email,
    verify_reset_token, verify_verification_token,
)

router = APIRouter(tags=["Auth & Users"])


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


@router.post("/google-login", response_model=TokenOut)
async def google_login(
    body: GoogleLoginIn,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    try:
        payload = verify_google_token(body.credential, settings.google_client_id)
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
            except Exception:
                await db.rollback()

    token = create_token(user.id, settings)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/auth/signup", response_model=None, status_code=202)
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

    # ── Dev bypass: skip email verification in local development ──
    if settings.dev_skip_email_verification:
        if not user.is_email_verified:
            user.is_email_verified = True
            await db.commit()
            await db.refresh(user)
        logger.warning("DEV_SKIP_EMAIL_VERIFICATION=true — auto-verifying %s", email)
        access_token = create_token(user.id, settings)
        return TokenOut(access_token=access_token, user=UserOut.model_validate(user))

    token = generate_verification_token(email, settings)
    email_sent = True
    email_error = ""
    if not settings.resend_api_key:
        email_sent = False
        email_error = "RESEND_API_KEY not configured on server"
        logger.error("send_verification_email skipped: %s", email_error)
    else:
        try:
            await send_verification_email(email, body.full_name, token, settings)
        except Exception as exc:
            email_sent = False
            email_error = str(exc)
            logger.error("send_verification_email failed for %s: %s", email, exc)

    return SignupPendingOut(
        message=(
            "Un email de verification a ete envoye a votre adresse."
            if email_sent
            else f"Compte cree. L'envoi de l'email a echoue ({email_error}). Utilisez le bouton 'Renvoyer' pour reessayer."
        ),
        email=email,
    )


@router.post("/auth/verify-email", response_model=TokenOut)
async def verify_email(
    body: VerifyEmailIn,
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

    if not user.is_email_verified:
        user.is_email_verified = True
        await db.commit()
        await db.refresh(user)

    token = create_token(user.id, settings)
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

    token = create_token(user.id, settings)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


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
        token = generate_reset_token(email, settings)
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

    email = verify_reset_token(body.token, settings)
    if email is None:
        raise HTTPException(status_code=400, detail="Lien de reinitialisation invalide ou expire")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Compte introuvable")

    user.password = _hash_password(body.password)
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
