from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.calendar import CalendarEvent
from app.models.professor import CourseOffering, LiveSession, ProgramTrack
from app.models.users import User
from app.schemas.calendar import CalendarEventDetailOut, CalendarEventOut


def can_view_broad_calendar(user: User) -> bool:
    return bool(user.is_staff or user.is_superuser or user.role == "professor")


def calendar_timezone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(status_code=400, detail="Invalid timezone") from exc


def date_start(value: date, timezone_name: str = "UTC") -> datetime:
    local_zone = calendar_timezone(timezone_name)
    return datetime.combine(value, time.min, tzinfo=local_zone).astimezone(timezone.utc)


def date_end_exclusive(value: date, timezone_name: str = "UTC") -> datetime:
    local_zone = calendar_timezone(timezone_name)
    local_end = datetime.combine(value + timedelta(days=1), time.min, tzinfo=local_zone)
    return local_end.astimezone(timezone.utc)


def current_week_range() -> tuple[date, date]:
    today = date.today()
    start = today - timedelta(days=today.weekday())
    return start, start + timedelta(days=6)


def calendar_event_out(event: CalendarEvent) -> CalendarEventOut:
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


def calendar_event_visibility_filter(user: User):
    if can_view_broad_calendar(user):
        return None
    return or_(
        LiveSession.id.is_(None),
        and_(ProgramTrack.niveau == user.niveau, ProgramTrack.filiere == user.filiere),
    )


def calendar_event_base_query():
    return (
        select(CalendarEvent)
        .outerjoin(LiveSession, LiveSession.calendar_event_id == CalendarEvent.id)
        .outerjoin(CourseOffering, CourseOffering.id == LiveSession.course_offering_id)
        .outerjoin(ProgramTrack, ProgramTrack.id == CourseOffering.track_id)
        .options(selectinload(CalendarEvent.subject), selectinload(CalendarEvent.topic))
    )


async def list_visible_calendar_events(
    db: AsyncSession,
    user: User,
    *,
    start: date | None,
    end: date | None,
    timezone_name: str = "UTC",
    limit: int = 50,
    offset: int = 0,
) -> list[CalendarEventOut]:
    if start is None or end is None:
        default_start, default_end = current_week_range()
        start = start or default_start
        end = end or default_end
    if end < start:
        raise HTTPException(status_code=400, detail="end must be on or after start")

    stmt = (
        calendar_event_base_query()
        .where(
            CalendarEvent.status != "cancelled",
            CalendarEvent.starts_at < date_end_exclusive(end, timezone_name),
            CalendarEvent.ends_at >= date_start(start, timezone_name),
        )
        .order_by(CalendarEvent.starts_at, CalendarEvent.id)
    )
    visibility_filter = calendar_event_visibility_filter(user)
    if visibility_filter is not None:
        stmt = stmt.where(visibility_filter)
    result = await db.execute(stmt.offset(offset).limit(limit))
    return [calendar_event_out(event) for event in result.scalars().all()]


async def get_visible_calendar_event_detail(
    db: AsyncSession,
    user: User,
    event_id: int,
) -> CalendarEventDetailOut:
    stmt = calendar_event_base_query().where(CalendarEvent.id == event_id)
    visibility_filter = calendar_event_visibility_filter(user)
    if visibility_filter is not None:
        stmt = stmt.where(visibility_filter)
    result = await db.execute(stmt)
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Calendar event not found")
    return CalendarEventDetailOut(**calendar_event_out(event).model_dump())
