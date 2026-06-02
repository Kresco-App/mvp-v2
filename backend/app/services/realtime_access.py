from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.professor import CourseOffering, LiveSession, ProgramTrack
from app.models.users import User
from app.schemas.realtime import AblyTokenOut, RealtimeSubscriptionsOut
from app.services.access import AccessContext, FeatureAccessRequirement, build_access_context
from app.services.ably import AblyConfigurationError, ably_client_id, create_ably_jwt, offering_notifications_channel_name

LIVE_SESSION_ACCESS_REQUIREMENT = FeatureAccessRequirement("live_sessions")
LIVE_SESSION_TOKEN_LOOKAHEAD = timedelta(days=7)


def active_live_session_filters(now: datetime) -> tuple:
    return (
        LiveSession.status.in_(["scheduled", "live"]),
        LiveSession.ends_at >= now,
        LiveSession.starts_at <= now + LIVE_SESSION_TOKEN_LOOKAHEAD,
    )


async def live_session_ids_for_user(
    db: AsyncSession,
    user: User,
    *,
    access_context: AccessContext | None = None,
) -> list[int]:
    now = datetime.now(timezone.utc)
    if user.role == "professor":
        result = await db.execute(
            select(LiveSession.id)
            .where(
                LiveSession.professor_user_id == user.id,
                *active_live_session_filters(now),
            )
            .order_by(LiveSession.starts_at.desc())
            .limit(100)
        )
        return [int(row[0]) for row in result.all()]

    access_context = access_context or await build_access_context(db, user)
    if not access_context.decide_for(LIVE_SESSION_ACCESS_REQUIREMENT).can_access:
        return []
    if not access_context.subject_scope_enforced:
        return []

    filters = [
        *active_live_session_filters(now),
        ProgramTrack.niveau == user.niveau,
        ProgramTrack.filiere == user.filiere,
        CourseOffering.status == "active",
        ProgramTrack.status == "active",
        CourseOffering.subject_id.in_(access_context.active_subject_ids),
    ]

    result = await db.execute(
        select(LiveSession.id)
        .join(CourseOffering, CourseOffering.id == LiveSession.course_offering_id)
        .join(ProgramTrack, ProgramTrack.id == CourseOffering.track_id)
        .where(*filters)
        .order_by(LiveSession.starts_at.desc())
        .limit(100)
    )
    return [int(row[0]) for row in result.all()]


async def offering_ids_for_user(
    db: AsyncSession,
    user: User,
    *,
    access_context: AccessContext | None = None,
) -> list[int]:
    if user.role == "professor":
        result = await db.execute(
            select(CourseOffering.id)
            .where(
                CourseOffering.professor_user_id == user.id,
                CourseOffering.status == "active",
            )
            .order_by(CourseOffering.id)
            .limit(500)
        )
        return [int(row[0]) for row in result.all()]

    access_context = access_context or await build_access_context(db, user)
    if not access_context.decide_for(LIVE_SESSION_ACCESS_REQUIREMENT).can_access:
        return []
    if not access_context.subject_scope_enforced:
        return []

    filters = [
        ProgramTrack.niveau == user.niveau,
        ProgramTrack.filiere == user.filiere,
        CourseOffering.status == "active",
        ProgramTrack.status == "active",
        CourseOffering.subject_id.in_(access_context.active_subject_ids),
    ]

    result = await db.execute(
        select(CourseOffering.id)
        .join(ProgramTrack, ProgramTrack.id == CourseOffering.track_id)
        .where(*filters)
        .order_by(CourseOffering.id)
        .limit(500)
    )
    return [int(row[0]) for row in result.all()]


async def build_ably_token(db: AsyncSession, *, user: User, settings: Settings) -> AblyTokenOut:
    try:
        access_context = None if user.role == "professor" else await build_access_context(db, user)
        live_session_ids = await live_session_ids_for_user(db, user, access_context=access_context)
        offering_ids = await offering_ids_for_user(db, user, access_context=access_context)
        token, expires_at, capability = create_ably_jwt(user, settings, live_session_ids, offering_ids)
    except AblyConfigurationError:
        raise HTTPException(status_code=503, detail="Realtime services are currently misconfigured: ABLY_API_KEY")
    return AblyTokenOut(
        token=token,
        client_id=ably_client_id(user),
        expires_at=expires_at,
        capability=capability,
    )


async def build_realtime_subscriptions(db: AsyncSession, *, user: User) -> RealtimeSubscriptionsOut:
    offering_ids = await offering_ids_for_user(db, user)
    channels = [f"kresco:user:{user.id}:notifications"]
    channels.extend(offering_notifications_channel_name(offering_id) for offering_id in offering_ids)
    return RealtimeSubscriptionsOut(notification_channels=channels)
