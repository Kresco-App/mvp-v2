from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.notifications import (
    NotificationBulkDeleteConfirmationOut,
    NotificationListOut,
    NotificationOut,
)
from app.services.notifications import (
    delete_all_user_notifications,
    delete_user_notification,
    generate_bulk_delete_confirmation_token,
    list_user_notifications,
    mark_all_user_notifications_read,
    mark_user_notification_read,
)

router = APIRouter(tags=["Notifications"])
NOTIFICATION_MUTATION_RATE_LIMIT = "30/minute"


@router.get("", response_model=NotificationListOut)
async def list_notifications(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_user_notifications(db, user, limit=limit, offset=offset)


@router.post("/read-all")
@limiter.limit(NOTIFICATION_MUTATION_RATE_LIMIT)
async def mark_all_notifications_read(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    return await mark_all_user_notifications_read(db, user)


@router.delete("")
@limiter.limit("10/minute")
async def delete_all_notifications(
    request: Request,
    confirmation_token: str = Query(default="", min_length=1),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    del request
    return await delete_all_user_notifications(db, user, confirmation_token=confirmation_token, settings=settings)


@router.get("/delete-all-confirmation", response_model=NotificationBulkDeleteConfirmationOut)
async def get_delete_all_confirmation(
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    confirmation_token, expires_in_seconds = generate_bulk_delete_confirmation_token(user=user, settings=settings)
    return NotificationBulkDeleteConfirmationOut(
        confirmation_token=confirmation_token,
        expires_in_seconds=expires_in_seconds,
    )


@router.delete("/{notification_id}")
@limiter.limit(NOTIFICATION_MUTATION_RATE_LIMIT)
async def delete_notification(
    request: Request,
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    return await delete_user_notification(db, user, notification_id)


@router.post("/{notification_id}/read", response_model=NotificationOut)
@limiter.limit(NOTIFICATION_MUTATION_RATE_LIMIT)
async def mark_notification_read(
    request: Request,
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    return await mark_user_notification_read(db, user, notification_id)
