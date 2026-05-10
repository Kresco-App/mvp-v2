from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_current_user, get_db
from app.models.calendar import CalendarEvent
from app.models.users import User
from app.schemas.calendar import CalendarEventDetailOut, CalendarEventOut

router = APIRouter(tags=["Calendar"])


def _date_start(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


def _date_end(value: date) -> datetime:
    return datetime.combine(value, time.max, tzinfo=timezone.utc)


def _event_out(event: CalendarEvent) -> CalendarEventOut:
    return CalendarEventOut(
        id=event.id,
        event_type=event.event_type,
        title=event.title,
        subtitle=event.subtitle,
        teacher_name=event.teacher_name,
        subject_id=event.subject_id,
        subject_title=event.subject.title if event.subject else "",
        topic_id=event.topic_id,
        topic_title=event.topic.title if event.topic else "",
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        description=event.description,
        preparation_href=event.preparation_href,
        join_url=event.join_url,
        status=event.status,
        color=event.color or "#5b60f9",
    )


@router.get("/events", response_model=list[CalendarEventOut])
async def list_calendar_events(
    start: date = Query(...),
    end: date = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del user
    if end < start:
        raise HTTPException(status_code=400, detail="end must be on or after start")

    result = await db.execute(
        select(CalendarEvent)
        .options(selectinload(CalendarEvent.subject), selectinload(CalendarEvent.topic))
        .where(
            CalendarEvent.status != "cancelled",
            CalendarEvent.starts_at <= _date_end(end),
            CalendarEvent.ends_at >= _date_start(start),
        )
        .order_by(CalendarEvent.starts_at, CalendarEvent.id)
    )
    return [_event_out(event) for event in result.scalars().all()]


@router.get("/events/{event_id}", response_model=CalendarEventDetailOut)
async def get_calendar_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del user
    result = await db.execute(
        select(CalendarEvent)
        .options(selectinload(CalendarEvent.subject), selectinload(CalendarEvent.topic))
        .where(CalendarEvent.id == event_id)
    )
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Calendar event not found")
    return CalendarEventDetailOut(**_event_out(event).model_dump())
