from datetime import datetime, timedelta, timezone

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.notifications import Notification
from app.models.users import User
from app.schemas.notifications import NotificationListOut, NotificationOut

NOTIFICATION_BULK_DELETE_TOKEN_SALT = "notifications-bulk-delete-v1"
NOTIFICATION_BULK_DELETE_TOKEN_TTL_SECONDS = 60


def _bulk_delete_serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.jwt_secret_key)


def generate_bulk_delete_confirmation_token(*, user: User, settings: Settings) -> tuple[str, int]:
    token = _bulk_delete_serializer(settings).dumps(
        {
            "user_id": user.id,
            "purpose": "delete_all_notifications",
            "issued_at": datetime.now(timezone.utc).isoformat(),
        },
        salt=NOTIFICATION_BULK_DELETE_TOKEN_SALT,
    )
    return token, NOTIFICATION_BULK_DELETE_TOKEN_TTL_SECONDS


def verify_bulk_delete_confirmation_token(*, token: str, user: User, settings: Settings) -> bool:
    try:
        payload = _bulk_delete_serializer(settings).loads(
            token,
            salt=NOTIFICATION_BULK_DELETE_TOKEN_SALT,
            max_age=NOTIFICATION_BULK_DELETE_TOKEN_TTL_SECONDS,
        )
    except (BadSignature, SignatureExpired, TypeError, ValueError):
        return False

    if not isinstance(payload, dict):
        return False
    if payload.get("purpose") != "delete_all_notifications":
        return False
    try:
        payload_user_id = int(payload.get("user_id"))
    except (TypeError, ValueError):
        return False
    return payload_user_id == user.id


async def create_notification(
    *,
    user_id: int,
    type: str,
    title: str,
    body: str = "",
    db: AsyncSession,
) -> Notification:
    notification = Notification(user_id=user_id, type=type, title=title, body=body)
    db.add(notification)
    await db.flush()
    return notification


async def list_user_notifications(
    db: AsyncSession,
    user: User,
    *,
    limit: int = 20,
    offset: int = 0,
) -> NotificationListOut:
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset(offset)
        .limit(limit)
    )
    notifications = list(result.scalars().all())
    unread_count = int(
        await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.id, Notification.is_read == False)  # noqa: E712
        )
        or 0
    )

    return NotificationListOut(
        notifications=[NotificationOut.model_validate(notification) for notification in notifications],
        unread_count=unread_count or 0,
    )


async def mark_all_user_notifications_read(db: AsyncSession, user: User) -> dict[str, bool]:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read == False)  # noqa: E712
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}


async def delete_all_user_notifications(
    db: AsyncSession,
    user: User,
    *,
    confirmation_token: str,
    settings: Settings,
) -> dict[str, bool]:
    if not verify_bulk_delete_confirmation_token(token=confirmation_token, user=user, settings=settings):
        raise HTTPException(status_code=400, detail="Valid confirmation token required")

    await db.execute(delete(Notification).where(Notification.user_id == user.id))
    await db.commit()
    return {"ok": True}


async def delete_user_notification(
    db: AsyncSession,
    user: User,
    notification_id: int,
) -> dict[str, bool]:
    notification = await db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
    )
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")

    await db.delete(notification)
    await db.commit()
    return {"ok": True}


async def mark_user_notification_read(
    db: AsyncSession,
    user: User,
    notification_id: int,
) -> NotificationOut:
    notification = await db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
    )
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")

    if notification.is_read:
        return NotificationOut.model_validate(notification)

    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return NotificationOut.model_validate(notification)
