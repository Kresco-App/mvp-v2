from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.users import User

from app.services.access import build_access_context
from app.services.course_access import require_topic_item_access
from app.services.xp import award_xp

INITIAL_PROGRESS_TRUST_SECONDS = 45
PROGRESS_UPDATE_GRACE_SECONDS = 5
PROGRESS_UPDATE_RATE_MULTIPLIER = 1.25


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def bounded_watch_progress(
    *,
    requested_seconds: int,
    current_seconds: int,
    duration_seconds: int,
    last_updated_at: datetime | None,
    is_new_progress: bool,
    now: datetime,
) -> int:
    requested = max(0, requested_seconds)
    if duration_seconds > 0:
        requested = min(requested, duration_seconds)
    if requested <= current_seconds:
        return current_seconds

    if is_new_progress or current_seconds <= 0:
        return min(requested, INITIAL_PROGRESS_TRUST_SECONDS)

    last_updated = coerce_utc(last_updated_at)
    elapsed = max(0, int((now - last_updated).total_seconds())) if last_updated else 0
    max_increment = int(elapsed * PROGRESS_UPDATE_RATE_MULTIPLIER) + PROGRESS_UPDATE_GRACE_SECONDS
    return min(requested, current_seconds + max_increment)


