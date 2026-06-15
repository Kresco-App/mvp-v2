import inspect
import os

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db, require_professor_active_offering
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.users import (
    AuthSessionOut, CsrfOut, ForgotPasswordIn, GoogleLoginIn, LoginIn, MessageOut, ResendVerificationIn,
    ProfileMediaOut, ResetPasswordIn, SignupIn, SignupPendingOut, UserOut, UserUpdateIn,
    VerifyEmailIn,
)
from app.security.csrf import clear_csrf_cookie, set_csrf_cookie
from app.services.auth import AUTH_COOKIE_NAME, AUTH_ROLE_COOKIE_NAME, create_token, verify_google_token
from app.services.auth_account import (
    authenticate_password_login,
    reset_password_account,
    revoke_user_sessions,
    verify_email_account,
)
from app.services.auth_email_dispatch import (
    EMAIL_PURPOSE_PASSWORD_RESET,
    EMAIL_PURPOSE_VERIFICATION,
    deliver_password_reset_email_dispatch,
    deliver_verification_email_dispatch,
    prepare_password_reset_dispatch,
    prepare_resend_verification_dispatch,
    prepare_signup_verification_dispatch,
)
from app.services.auth_google import complete_google_login
from app.services.auth_signup import create_or_reclaim_signup_user
from app.services.email import send_reset_email, send_verification_email
from app.services.media_storage import get_media_storage, media_url
from app.services.user_profile import (
    update_profile_state,
    upload_profile_media_state,
    user_out as profile_user_out,
)
from app.services.xp import award_daily_login_xp

router = APIRouter(tags=["Auth & Users"])

AUTH_LOGIN_RATE_LIMIT = os.environ.get("KRESCO_AUTH_LOGIN_RATE_LIMIT", "5/minute")
AUTH_SENSITIVE_RATE_LIMIT = os.environ.get("KRESCO_AUTH_SENSITIVE_RATE_LIMIT", "3/minute")
AUTH_SESSION_RATE_LIMIT = os.environ.get("KRESCO_AUTH_SESSION_RATE_LIMIT", "20/minute")
PROFILE_MUTATION_RATE_LIMIT = os.environ.get("KRESCO_PROFILE_MUTATION_RATE_LIMIT", "20/minute")
PROFILE_MEDIA_RATE_LIMIT = os.environ.get("KRESCO_PROFILE_MEDIA_RATE_LIMIT", "10/minute")
MIN_PASSWORD_LENGTH = 8


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


@router.post("/google-login", response_model=AuthSessionOut)
@limiter.limit(AUTH_LOGIN_RATE_LIMIT)
async def google_login(
    request: Request,
    body: GoogleLoginIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    del request
    try:
        verification = verify_google_token(body.credential, settings.google_client_id)
        payload = await verification if inspect.isawaitable(verification) else verification
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google credential")

    user = await complete_google_login(
        db,
        payload=payload,
        require_professor_active_offering_fn=require_professor_active_offering,
    )

    return await _auth_session_out(db, response=response, user=user, settings=settings)


@router.post("/auth/signup", response_model=SignupPendingOut, status_code=202)
@limiter.limit("3/minute")
async def signup(
    request: Request,
    body: SignupIn,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    if len(body.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caracteres")

    email = body.email.lower().strip()
    user = await create_or_reclaim_signup_user(
        db,
        email=email,
        full_name=body.full_name,
        plain_password=body.password,
    )

    if dispatch := await prepare_signup_verification_dispatch(
        db,
        email=email,
        full_name=body.full_name,
        token_version=user.email_token_version or 0,
        settings=settings,
    ):
        background_tasks.add_task(
            deliver_verification_email_dispatch,
            dispatch,
            settings,
            send_verification_email,
            flow="signup_verification",
        )

    return SignupPendingOut(
        message="Un email de verification a ete envoye a votre adresse.",
        email=email,
    )


@router.post("/auth/verify-email", response_model=AuthSessionOut)
@limiter.limit(AUTH_SENSITIVE_RATE_LIMIT)
async def verify_email(
    request: Request,
    body: VerifyEmailIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    del request
    user = await verify_email_account(db, token=body.token, settings=settings)
    return await _auth_session_out(db, response=response, user=user, settings=settings)


@router.post("/auth/resend-verification", response_model=MessageOut)
@limiter.limit("3/minute")
async def resend_verification(
    request: Request,
    body: ResendVerificationIn,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    email = body.email.lower().strip()
    if dispatch := await prepare_resend_verification_dispatch(db, email=email, settings=settings):
        background_tasks.add_task(
            deliver_verification_email_dispatch,
            dispatch,
            settings,
            send_verification_email,
            flow="resend_verification",
        )

    # Always return success to avoid email enumeration
    return MessageOut(message="Si ce compte existe et n'est pas verifie, un email a ete envoye.")


@router.post("/auth/login", response_model=AuthSessionOut)
@limiter.limit(AUTH_LOGIN_RATE_LIMIT)
async def login(
    request: Request,
    body: LoginIn,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    user = await authenticate_password_login(
        db,
        email=body.email,
        password=body.password,
        require_professor_active_offering_fn=require_professor_active_offering,
    )
    return await _auth_session_out(db, response=response, user=user, settings=settings)


@router.post("/auth/logout", response_model=MessageOut)
@limiter.limit(AUTH_SESSION_RATE_LIMIT)
async def logout(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    del request
    await revoke_user_sessions(db, user)
    _clear_auth_cookies(response, settings)
    return MessageOut(message="Deconnecte.")


@router.get("/auth/csrf", response_model=CsrfOut)
async def csrf_token(
    response: Response,
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return CsrfOut(csrf_token=set_csrf_cookie(response, user, settings))


@router.post("/auth/forgot-password", response_model=MessageOut)
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    body: ForgotPasswordIn,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    email = body.email.lower().strip()
    if dispatch := await prepare_password_reset_dispatch(db, email=email, settings=settings):
        background_tasks.add_task(
            deliver_password_reset_email_dispatch,
            dispatch,
            settings,
            send_reset_email,
            flow="forgot_password",
        )

    # Always return success to avoid email enumeration
    return MessageOut(message="Si ce compte existe, vous recevrez un email de reinitialisation.")


@router.post("/auth/reset-password", response_model=MessageOut)
@limiter.limit(AUTH_SENSITIVE_RATE_LIMIT)
async def reset_password(
    request: Request,
    body: ResetPasswordIn,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    del request
    if len(body.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caracteres")

    await reset_password_account(db, token=body.token, password=body.password, settings=settings)
    return MessageOut(message="Mot de passe reinitialise avec succes.")


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
