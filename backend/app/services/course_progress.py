from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_or_create
from app.models.courses import TopicItem
from app.models.gamification import TopicItemProgress

TOPIC_ITEM_COMPLETION_GRACE_SECONDS = 5
TOPIC_ITEM_COMPLETION_RATE_MULTIPLIER = 1.25


def coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def requires_timed_topic_completion(item: TopicItem) -> bool:
    return item.duration_seconds > 0 and (
        "video" in item.item_type or item.completion_policy in {"watch", "video", "timed"}
    )


def required_topic_watch_seconds(duration_seconds: int) -> int:
    return max(1, (duration_seconds * 9 + 9) // 10)


def bounded_topic_watch_seconds(
    *,
    item: TopicItem,
    progress: TopicItemProgress,
    requested_seconds: int,
    now: datetime,
    latest_other_watch_updated_at: datetime | None = None,
) -> int:
    current_seconds = progress.watched_seconds or 0
    if item.duration_seconds <= 0:
        return current_seconds

    requested = min(max(0, requested_seconds), item.duration_seconds)
    if requested <= current_seconds:
        return current_seconds

    if current_seconds <= 0:
        item_bound = min(requested, TOPIC_ITEM_COMPLETION_GRACE_SECONDS)
    else:
        last_updated = coerce_utc(progress.updated_at)
        elapsed = max(0, int((now - last_updated).total_seconds())) if last_updated else 0
        max_increment = int(elapsed * TOPIC_ITEM_COMPLETION_RATE_MULTIPLIER)
        item_bound = min(requested, current_seconds + max_increment)

    latest_other_watch_updated_at = coerce_utc(latest_other_watch_updated_at)
    if latest_other_watch_updated_at is None:
        return item_bound

    elapsed = max(0, int((now - latest_other_watch_updated_at).total_seconds()))
    user_max_increment = int(elapsed * TOPIC_ITEM_COMPLETION_RATE_MULTIPLIER)
    return min(item_bound, current_seconds + user_max_increment)


async def latest_other_watch_progress_updated_at(
    db: AsyncSession,
    *,
    user_id: int,
    topic_item_id: int,
) -> datetime | None:
    return await db.scalar(
        select(TopicItemProgress.updated_at)
        .where(
            TopicItemProgress.user_id == user_id,
            TopicItemProgress.topic_item_id != topic_item_id,
            TopicItemProgress.watched_seconds > 0,
        )
        .order_by(TopicItemProgress.updated_at.desc())
        .limit(1)
    )


async def get_or_create_topic_item_progress(
    db: AsyncSession,
    *,
    user_id: int,
    topic_id: int,
    topic_item_id: int,
    status: str = "started",
) -> TopicItemProgress:
    progress, _ = await get_or_create(
        db, 
        TopicItemProgress, 
        defaults={"topic_id": topic_id, "status": status},
        user_id=user_id, 
        topic_item_id=topic_item_id
    )
    return progress
