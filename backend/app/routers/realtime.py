from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db
from app.models.users import User
from app.schemas.realtime import AblyTokenOut, RealtimeSubscriptionsOut
from app.services.realtime_access import build_ably_token, build_realtime_subscriptions

router = APIRouter(tags=["Realtime"])


@router.get("/ably-token", response_model=AblyTokenOut)
async def get_ably_token(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    return await build_ably_token(db, user=user, settings=settings)


@router.get("/subscriptions", response_model=RealtimeSubscriptionsOut)
async def get_realtime_subscriptions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await build_realtime_subscriptions(db, user=user)
