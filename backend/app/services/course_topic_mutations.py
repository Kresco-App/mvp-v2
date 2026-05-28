from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.courses import TopicItem
from app.models.users import User
from app.schemas.courses import TopicItemCompleteIn
from app.services.course_access import access_for_topic_item
from app.services.course_progress import (
    bounded_topic_watch_seconds,
    get_or_create_topic_item_progress,
    required_topic_watch_seconds,
    requires_timed_topic_completion,
)
from app.services.xp import award_xp

QUIZ_ITEM_TYPES = {"quiz", "checkpoint_quiz", "quiz_set", "question_set"}
XP_REASON_BY_ITEM_TYPE = {
    "video": "video_complete",
    "interactive": "lab_complete",
    "lab": "lab_complete",
    "reading": "lesson_complete",
    "lesson": "lesson_complete",
    "text": "lesson_complete",
    "pdf": "lesson_complete",
    "resource": "lesson_complete",
}


def _normalized_item_type(item_type: str) -> str:
    return item_type.strip().lower()


def _is_quiz_item_type(item_type: str) -> bool:
    return _normalized_item_type(item_type) in QUIZ_ITEM_TYPES


def _xp_reason_for_item_type(item_type: str) -> str:
    return XP_REASON_BY_ITEM_TYPE.get(_normalized_item_type(item_type), "lesson_complete")


async def _get_accessible_topic_item(db: AsyncSession, user: User, item_id: int) -> TopicItem:
    result = await db.execute(
        select(TopicItem)
        .options(selectinload(TopicItem.topic))
        .where(TopicItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Topic item not found")
    access = await access_for_topic_item(db, user, item)
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)
    return item


async def complete_topic_item_state(
    db: AsyncSession,
    *,
    user: User,
    item_id: int,
    body: TopicItemCompleteIn,
) -> dict[str, int | bool]:
    item = await _get_accessible_topic_item(db, user, item_id)
    if _is_quiz_item_type(item.item_type):
        raise HTTPException(status_code=400, detail="Quiz items must be submitted through quiz endpoints")
    progress = await get_or_create_topic_item_progress(
        db,
        user_id=user.id,
        topic_id=item.topic_id,
        topic_item_id=item.id,
    )
    was_completed = progress.status == "completed" if progress else False
    now = datetime.now(timezone.utc)
    bounded_watched_seconds = bounded_topic_watch_seconds(
        item=item,
        progress=progress,
        requested_seconds=body.watched_seconds,
        now=now,
    )
    if bounded_watched_seconds > (progress.watched_seconds or 0):
        progress.watched_seconds = bounded_watched_seconds
    if (
        not was_completed
        and requires_timed_topic_completion(item)
        and progress.watched_seconds < required_topic_watch_seconds(item.duration_seconds)
    ):
        await db.commit()
        raise HTTPException(status_code=409, detail="Topic item is not eligible for completion yet")
    progress.status = "completed"
    progress.completed_at = now
    xp_reason = _xp_reason_for_item_type(item.item_type)
    xp_earned = 0
    if not was_completed:
        xp_earned = await award_xp(
            user.id,
            xp_reason,
            f"TopicItem {item.id} completed",
            db,
            subject_id=item.topic.subject_id if item.topic else None,
            topic_id=item.topic_id,
            topic_section_id=item.section_id,
            topic_item_id=item.id,
            idempotency_key=f"topic_item_complete:user:{user.id}:item:{item.id}",
        )
    await db.commit()
    return {"ok": True, "xp_earned": xp_earned}
