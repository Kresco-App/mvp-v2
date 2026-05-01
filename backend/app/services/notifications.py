from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notifications import Notification


async def create_notification(
    user_id: int,
    type: str,
    title: str,
    body: str,
    db: AsyncSession,
) -> Notification:
    """Create and persist a notification for a user.

    Can be called from any router after an XP award, quest completion,
    badge unlock, streak update, or system event.

    Example::

        from app.services.notifications import create_notification

        await create_notification(
            user_id=user.id,
            type="xp",
            title="+50 XP",
            body="You completed a lesson!",
            db=db,
        )
    """
    notif = Notification(user_id=user_id, type=type, title=title, body=body)
    db.add(notif)
    await db.commit()
    return notif
