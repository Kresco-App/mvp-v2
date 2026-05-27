from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db
from app.models.professor import CourseOffering, LiveSession, ProgramTrack
from app.models.users import User
from app.schemas.realtime import AblyTokenOut
from app.services.access import FeatureAccessRequirement, build_access_context
from app.services.ably import AblyConfigurationError, ably_client_id, create_ably_jwt

router = APIRouter(tags=["Realtime"])


LIVE_SESSION_ACCESS_REQUIREMENT = FeatureAccessRequirement("live_sessions")
LIVE_SESSION_TOKEN_LOOKAHEAD = timedelta(days=7)


def _active_live_session_filters(now: datetime) -> tuple:
    return (
        LiveSession.status.in_(["scheduled", "live"]),
        LiveSession.ends_at >= now,
        LiveSession.starts_at <= now + LIVE_SESSION_TOKEN_LOOKAHEAD,
    )


async def _live_session_ids_for_user(db: AsyncSession, user: User) -> list[int]:
    now = datetime.now(timezone.utc)
    if user.role == "professor":
        result = await db.execute(
            select(LiveSession.id)
            .where(
                LiveSession.professor_user_id == user.id,
                *_active_live_session_filters(now),
            )
            .order_by(LiveSession.starts_at.desc())
            .limit(100)
        )
        return [int(row[0]) for row in result.all()]

    access_context = await build_access_context(db, user)
    if not access_context.decide_for(LIVE_SESSION_ACCESS_REQUIREMENT).can_access:
        return []

    filters = [
        *_active_live_session_filters(now),
        ProgramTrack.niveau == user.niveau,
        ProgramTrack.filiere == user.filiere,
        CourseOffering.status == "active",
        ProgramTrack.status == "active",
    ]
    if access_context.subject_scope_enforced:
        filters.append(CourseOffering.subject_id.in_(access_context.active_subject_ids))

    result = await db.execute(
        select(LiveSession.id)
        .join(CourseOffering, CourseOffering.id == LiveSession.course_offering_id)
        .join(ProgramTrack, ProgramTrack.id == CourseOffering.track_id)
        .where(*filters)
        .order_by(LiveSession.starts_at.desc())
        .limit(100)
    )
    return [int(row[0]) for row in result.all()]


@router.get("/ably-token", response_model=AblyTokenOut)
async def get_ably_token(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    try:
        live_session_ids = await _live_session_ids_for_user(db, user)
        token, expires_at, capability = create_ably_jwt(user, settings, live_session_ids)
    except AblyConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return AblyTokenOut(
        token=token,
        client_id=ably_client_id(user),
        expires_at=expires_at,
        capability=capability,
    )
