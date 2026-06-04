from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.courses import TabContent, Topic, TopicItem
from app.models.professor import ProfessorChangeRequest

ALLOWED_CHANGE_TARGETS = {"topic", "topic_item", "tab_content"}


def topic_offering_id(topic: Topic) -> int | None:
    return getattr(topic, "course_offering_id", None)


async def target_belongs_to_offering(
    db: AsyncSession,
    offering_id: int,
    target_type: str,
    target_id: int,
) -> bool:
    if target_type == "topic":
        topic = await db.scalar(select(Topic).where(Topic.id == target_id))
        return bool(topic and topic_offering_id(topic) == offering_id)
    if target_type == "topic_item":
        result = await db.execute(
            select(TopicItem).options(selectinload(TopicItem.topic)).where(TopicItem.id == target_id)
        )
        item = result.scalar_one_or_none()
        return bool(item and item.topic and topic_offering_id(item.topic) == offering_id)
    if target_type == "tab_content":
        result = await db.execute(
            select(TabContent)
            .options(selectinload(TabContent.topic_item).selectinload(TopicItem.topic))
            .where(TabContent.id == target_id)
        )
        tab = result.scalar_one_or_none()
        return bool(tab and tab.topic_item and tab.topic_item.topic and topic_offering_id(tab.topic_item.topic) == offering_id)
    return False


async def close_dangling_change_requests(
    db: AsyncSession,
    *,
    offering_ids: list[int],
) -> int:
    if not offering_ids:
        return 0
    result = await db.execute(
        select(ProfessorChangeRequest)
        .where(
            ProfessorChangeRequest.course_offering_id.in_(offering_ids),
            ProfessorChangeRequest.status == "pending",
        )
        .with_for_update()
    )
    now = datetime.now(timezone.utc)
    closed = 0
    for change_request in result.scalars().all():
        target_exists = await target_belongs_to_offering(
            db,
            change_request.course_offering_id,
            change_request.target_type,
            change_request.target_id,
        )
        if target_exists:
            continue
        change_request.status = "target_deleted"
        change_request.reviewed_at = now
        change_request.admin_note = "Target was deleted or no longer belongs to this course offering."
        closed += 1
    if closed:
        await db.flush()
        await db.commit()
    return closed
