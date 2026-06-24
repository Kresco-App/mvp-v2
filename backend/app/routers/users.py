import inspect
import logging
import os

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db, require_professor_active_offering
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.users import (
    AuthSessionOut,
    CsrfOut,
    FirebaseSessionIn,
    MessageOut,
    ProfileMediaOut,
    UserOut,
    UserUpdateIn,
)
from app.security.csrf import clear_csrf_cookie, set_csrf_cookie
from app.services.auth import AUTH_COOKIE_NAME, AUTH_ROLE_COOKIE_NAME, create_token, verify_firebase_token
from app.services.auth_firebase import complete_firebase_session
from app.services.auth_sessions import revoke_cookie_session_if_valid
from app.services.media_storage import get_media_storage, media_url
from app.services.user_profile import (
    update_profile_state,
    upload_profile_media_state,
    user_out as profile_user_out,
)
from app.services.xp import award_daily_login_xp

router = APIRouter(tags=["Auth & Users"])
logger = logging.getLogger("kresco.auth")

AUTH_LOGIN_RATE_LIMIT = os.environ.get("KRESCO_AUTH_LOGIN_RATE_LIMIT", "5/minute")
AUTH_SESSION_RATE_LIMIT = os.environ.get("KRESCO_AUTH_SESSION_RATE_LIMIT", "20/minute")
PROFILE_MUTATION_RATE_LIMIT = os.environ.get("KRESCO_PROFILE_MUTATION_RATE_LIMIT", "20/minute")
PROFILE_MEDIA_RATE_LIMIT = os.environ.get("KRESCO_PROFILE_MEDIA_RATE_LIMIT", "10/minute")


def _auth_cookie_secure(settings: Settings) -> bool:
    return settings.is_production_like


def _auth_cookie_samesite(settings: Settings) -> str:
    return settings.auth_cookie_samesite_value


def _set_auth_cookies(response: Response, token: str, user: User, settings: Settings) -> str:
    max_age = max(int(settings.jwt_expire_minutes) * 60, 0)
    secure = _auth_cookie_secure(settings)
    samesite = _auth_cookie_samesite(settings)
    response.set_cookie(
        AUTH_COOKIE_NAME,
        token,
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )
    response.set_cookie(
        AUTH_ROLE_COOKIE_NAME,
        user.role or "",
        max_age=max_age,
        httponly=False,
        secure=secure,
        samesite=samesite,
        path="/",
    )
    return set_csrf_cookie(response, user, settings)


def _clear_auth_cookies(response: Response, settings: Settings) -> None:
    secure = _auth_cookie_secure(settings)
    samesite = _auth_cookie_samesite(settings)
    response.delete_cookie(
        AUTH_COOKIE_NAME,
        path="/",
        secure=secure,
        httponly=True,
        samesite=samesite,
    )
    response.delete_cookie(
        AUTH_ROLE_COOKIE_NAME,
        path="/",
        secure=secure,
        httponly=False,
        samesite=samesite,
    )
    clear_csrf_cookie(response, settings)


def _user_out(user: User, settings: Settings) -> UserOut:
    return profile_user_out(user, settings, media_url_fn=media_url)


async def _auth_session_out(
    db: AsyncSession,
    *,
    response: Response,
    user: User,
    settings: Settings,
) -> AuthSessionOut:
    token = create_token(user, settings)
    csrf_token = _set_auth_cookies(response, token, user, settings)
    await award_daily_login_xp(db, user_id=user.id)
    await db.commit()
    return AuthSessionOut(user=_user_out(user, settings), csrf_token=csrf_token)


async def _firebase_session_user(
    db: AsyncSession,
    *,
    credential: str,
    settings: Settings,
) -> User:
    if not settings.firebase_project_id.strip():
        raise HTTPException(status_code=503, detail="Firebase authentication is not configured")

    try:
        verification = verify_firebase_token(credential, settings.firebase_project_id)
        payload = await verification if inspect.isawaitable(verification) else verification
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("firebase_session_verification_failed error_type=%s", type(exc).__name__, exc_info=True)
        raise HTTPException(status_code=401, detail="Invalid Firebase credential")

    return await complete_firebase_session(
        db,
        payload=payload,
        require_professor_active_offering_fn=require_professor_active_offering,
    )


@router.post("/auth/firebase-session", response_model=AuthSessionOut)
@limiter.limit(AUTH_LOGIN_RATE_LIMIT)
async def firebase_session(
    request: Request,
    body: FirebaseSessionIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    del request
    user = await _firebase_session_user(db, credential=body.credential, settings=settings)
    return await _auth_session_out(db, response=response, user=user, settings=settings)


@router.post("/google-login", response_model=AuthSessionOut)
@limiter.limit(AUTH_LOGIN_RATE_LIMIT)
async def google_login(
    request: Request,
    body: FirebaseSessionIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    del request
    user = await _firebase_session_user(db, credential=body.credential, settings=settings)
    return await _auth_session_out(db, response=response, user=user, settings=settings)


@router.post("/auth/logout", response_model=MessageOut)
@limiter.limit(AUTH_SESSION_RATE_LIMIT)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    await revoke_cookie_session_if_valid(
        db,
        token=request.cookies.get(AUTH_COOKIE_NAME),
        settings=settings,
    )
    _clear_auth_cookies(response, settings)
    return MessageOut(message="Deconnecte.")


@router.get("/auth/csrf", response_model=CsrfOut)
async def csrf_token(
    response: Response,
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return CsrfOut(csrf_token=set_csrf_cookie(response, user, settings))


@router.get("/profile/me", response_model=UserOut)
async def get_profile(
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return _user_out(user, settings)


@router.patch("/profile/me", response_model=UserOut)
@limiter.limit(PROFILE_MUTATION_RATE_LIMIT)
async def update_profile(
    request: Request,
    body: UserUpdateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    del request
    return await update_profile_state(db, user=user, body=body, settings=settings, media_url_fn=media_url)


@router.post("/profile/me/media/{kind}", response_model=ProfileMediaOut)
@limiter.limit(PROFILE_MEDIA_RATE_LIMIT)
async def upload_profile_media(
    request: Request,
    kind: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    del request
    return await upload_profile_media_state(
        db,
        user=user,
        kind=kind,
        file=file,
        settings=settings,
        storage_factory=get_media_storage,
    )
