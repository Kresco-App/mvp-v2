from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.users import User
from app.schemas.realtime import RealtimeSubscriptionsOut
from app.services.realtime_access import build_realtime_subscriptions

router = APIRouter(tags=["Realtime"])


@router.get("/subscriptions", response_model=RealtimeSubscriptionsOut)
async def get_realtime_subscriptions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await build_realtime_subscriptions(db, user=user)
