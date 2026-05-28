from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.users import User
from app.schemas.calendar import CalendarEventDetailOut, CalendarEventOut
from app.services.calendar_read_models import get_visible_calendar_event_detail, list_visible_calendar_events

router = APIRouter(tags=["Calendar"])


@router.get("/events", response_model=list[CalendarEventOut])
async def list_calendar_events(
    start: date | None = Query(None),
    end: date | None = Query(None),
    timezone_name: str = Query(default="UTC", alias="timezone", min_length=1, max_length=64),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_visible_calendar_events(
        db,
        user,
        start=start,
        end=end,
        timezone_name=timezone_name,
        limit=limit,
        offset=offset,
    )


@router.get("/events/{event_id}", response_model=CalendarEventDetailOut)
async def get_calendar_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await get_visible_calendar_event_detail(db, user, event_id)
