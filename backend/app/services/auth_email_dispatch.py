import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.database import get_session_factory
from app.models.users import EmailDispatchThrottle
from app.security.passwords import is_unusable_password
from app.services.auth_users import get_user_by_email, normalize_email
from app.services.email import generate_reset_token, generate_verification_token

logger = logging.getLogger("kresco.auth")

EMAIL_DISPATCH_COOLDOWN = timedelta(minutes=5)
EMAIL_DISPATCH_WINDOW = timedelta(hours=24)
EMAIL_DISPATCH_MAX_PER_WINDOW = 5
EMAIL_PURPOSE_PASSWORD_RESET = "password_reset"
EMAIL_PURPOSE_VERIFICATION = "email_verification"
VerificationEmailSender = Callable[[str, str, str, Settings], Awaitable[None]]
PasswordResetEmailSender = Callable[[str, str, Settings], Awaitable[None]]


@dataclass(frozen=True)
class EmailDispatchReservation:
    email: str
    purpose: str
    created: bool
    previous_window_started_at: datetime | None
    previous_sent_count: int | None
    previous_last_sent_at: datetime | None
    reserved_window_started_at: datetime
    reserved_sent_count: int
    reserved_last_sent_at: datetime | None


@dataclass(frozen=True)
class PreparedEmailDispatch:
    email: str
    token: str
    reservation: EmailDispatchReservation
    full_name: str = ""


def as_aware_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def same_dispatch_timestamp(left: datetime | None, right: datetime | None) -> bool:
    if left is None or right is None:
        return left is None and right is None
    return as_aware_utc(left) == as_aware_utc(right)


def reservation_matches_current_state(
    throttle: EmailDispatchThrottle,
    reservation: EmailDispatchReservation,
) -> bool:
    return (
        same_dispatch_timestamp(throttle.window_started_at, reservation.reserved_window_started_at)
        and int(throttle.sent_count or 0) == reservation.reserved_sent_count
        and same_dispatch_timestamp(throttle.last_sent_at, reservation.reserved_last_sent_at)
    )


def log_email_dispatch_failure(flow: str, exc: Exception) -> None:
    logger.warning(
        "auth_email_dispatch_failed",
        extra={"flow": flow, "error_type": type(exc).__name__},
    )


async def reserve_email_dispatch(db: AsyncSession, email: str, purpose: str) -> EmailDispatchReservation | None:
    email = normalize_email(email)
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(EmailDispatchThrottle)
        .where(
            EmailDispatchThrottle.email == email,
            EmailDispatchThrottle.purpose == purpose,
        )
        .with_for_update()
    )
    throttle = result.scalar_one_or_none()

    if throttle is None:
        reservation = EmailDispatchReservation(
            email=email,
            purpose=purpose,
            created=True,
            previous_window_started_at=None,
            previous_sent_count=None,
            previous_last_sent_at=None,
            reserved_window_started_at=now,
            reserved_sent_count=1,
            reserved_last_sent_at=now,
        )
        throttle = EmailDispatchThrottle(
            email=email,
            purpose=purpose,
            window_started_at=now,
            sent_count=1,
            last_sent_at=now,
        )
        db.add(throttle)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            return None
    else:
        previous_window_started_at = throttle.window_started_at
        previous_sent_count = int(throttle.sent_count or 0)
        previous_last_sent_at = throttle.last_sent_at
        window_started_at = as_aware_utc(throttle.window_started_at)
        last_sent_at = as_aware_utc(throttle.last_sent_at) if throttle.last_sent_at else None

        if last_sent_at is not None and now - last_sent_at < EMAIL_DISPATCH_COOLDOWN:
            return None

        if now - window_started_at >= EMAIL_DISPATCH_WINDOW:
            throttle.window_started_at = now
            throttle.sent_count = 0

        if int(throttle.sent_count or 0) >= EMAIL_DISPATCH_MAX_PER_WINDOW:
            return None

        throttle.sent_count = int(throttle.sent_count or 0) + 1
        throttle.last_sent_at = now
        throttle.updated_at = now
        reservation = EmailDispatchReservation(
            email=email,
            purpose=purpose,
            created=False,
            previous_window_started_at=previous_window_started_at,
            previous_sent_count=previous_sent_count,
            previous_last_sent_at=previous_last_sent_at,
            reserved_window_started_at=throttle.window_started_at,
            reserved_sent_count=int(throttle.sent_count or 0),
            reserved_last_sent_at=throttle.last_sent_at,
        )

    return reservation


async def release_email_dispatch_reservation(reservation: EmailDispatchReservation) -> None:
    session_factory = get_session_factory()
    if session_factory is None:
        logger.error("email_dispatch_reservation_release_failed", extra={"reason": "database_unavailable"})
        return
    async with session_factory() as db:
        result = await db.execute(
            select(EmailDispatchThrottle)
            .where(
                EmailDispatchThrottle.email == reservation.email,
                EmailDispatchThrottle.purpose == reservation.purpose,
            )
            .with_for_update()
        )
        throttle = result.scalar_one_or_none()
        if throttle is None:
            return
        if not reservation_matches_current_state(throttle, reservation):
            return
        if reservation.created:
            await db.delete(throttle)
        else:
            throttle.window_started_at = reservation.previous_window_started_at or throttle.window_started_at
            throttle.sent_count = int(reservation.previous_sent_count or 0)
            throttle.last_sent_at = reservation.previous_last_sent_at
            throttle.updated_at = datetime.now(timezone.utc)
        await db.commit()


async def prepare_signup_verification_dispatch(
    db: AsyncSession,
    *,
    email: str,
    full_name: str,
    token_version: int,
    settings: Settings,
) -> PreparedEmailDispatch | None:
    email = normalize_email(email)
    reservation = await reserve_email_dispatch(db, email, EMAIL_PURPOSE_VERIFICATION)
    if reservation is None:
        return None
    await db.commit()
    token = generate_verification_token(email, settings, token_version=token_version)
    return PreparedEmailDispatch(email=email, full_name=full_name, token=token, reservation=reservation)


async def prepare_resend_verification_dispatch(
    db: AsyncSession,
    *,
    email: str,
    settings: Settings,
) -> PreparedEmailDispatch | None:
    email = normalize_email(email)
    user = await get_user_by_email(db, email)
    if not user or user.is_email_verified:
        return None
    reservation = await reserve_email_dispatch(db, email, EMAIL_PURPOSE_VERIFICATION)
    if reservation is None:
        return None
    await db.commit()
    token = generate_verification_token(email, settings, token_version=user.email_token_version or 0)
    return PreparedEmailDispatch(email=email, full_name=user.full_name, token=token, reservation=reservation)


async def prepare_password_reset_dispatch(
    db: AsyncSession,
    *,
    email: str,
    settings: Settings,
) -> PreparedEmailDispatch | None:
    email = normalize_email(email)
    user = await get_user_by_email(db, email, active_only=True)
    if not user or not user.is_email_verified or is_unusable_password(user.password):
        return None
    reservation = await reserve_email_dispatch(db, email, EMAIL_PURPOSE_PASSWORD_RESET)
    if reservation is None:
        return None
    await db.commit()
    token = generate_reset_token(email, settings, token_version=user.email_token_version or 0)
    return PreparedEmailDispatch(email=email, token=token, reservation=reservation)


async def deliver_verification_email_dispatch(
    dispatch: PreparedEmailDispatch,
    settings: Settings,
    send_email: VerificationEmailSender,
    *,
    flow: str,
) -> None:
    try:
        await send_email(dispatch.email, dispatch.full_name, dispatch.token, settings)
    except Exception as exc:
        await release_email_dispatch_reservation(dispatch.reservation)
        log_email_dispatch_failure(flow, exc)


async def deliver_password_reset_email_dispatch(
    dispatch: PreparedEmailDispatch,
    settings: Settings,
    send_email: PasswordResetEmailSender,
    *,
    flow: str,
) -> None:
    try:
        await send_email(dispatch.email, dispatch.token, settings)
    except Exception as exc:
        await release_email_dispatch_reservation(dispatch.reservation)
        log_email_dispatch_failure(flow, exc)
