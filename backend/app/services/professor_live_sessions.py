from fastapi import HTTPException, Request
from sqlalchemy import insert, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.calendar import CalendarEvent
from app.models.notifications import Notification
from app.models.professor import CourseOffering, LiveSession
from app.models.users import User
from app.schemas.professor import (
    LiveSessionIn,
    LiveSessionStreamCredentialsOut,
    LiveSessionUpdateIn,
    ProfessorLiveSessionOut,
)
from app.services.ably import live_session_channel_name, offering_notifications_channel_name
from app.services.professor_audit import enforce_professor_mutation_rate_limit, record_professor_audit
from app.services.professor_queries import professor_offerings, require_professor_live_session, require_professor_offering
from app.services.professor_serializers import (
    live_session_realtime_payload,
    notification_status_from_realtime,
    professor_live_session_out,
)
from app.services.professor_status import ALLOWED_LIVE_STATUSES, LiveSessionStatus
from app.services.realtime_outbox import enqueue_realtime_event
from app.services.vdocipher import create_live_stream, sanitize_provider_payload

MAX_PROFESSOR_LIVE_SESSIONS_LIMIT = 100


async def enqueue_live_session_event(db: AsyncSession, live_session_id: int, event_name: str, payload: dict) -> None:
    await enqueue_realtime_event(
        db,
        channel=live_session_channel_name(live_session_id),
        event_name=event_name,
        payload=payload,
    )


async def enqueue_live_session_event_and_track(db: AsyncSession, session: LiveSession, event_name: str) -> None:
    await enqueue_live_session_event(db, session.id, event_name, live_session_realtime_payload(session))


def live_calendar_subtitle(offering: CourseOffering) -> str:
    subject_title = offering.subject.title if offering.subject else ""
    track_title = offering.track.title if offering.track else ""
    return " - ".join(part for part in [subject_title, track_title] if part)


def sync_calendar_event_from_live_session(
    event: CalendarEvent,
    session: LiveSession,
    offering: CourseOffering,
    professor: User,
) -> None:
    event.event_type = "live_session"
    event.title = session.title
    event.subtitle = live_calendar_subtitle(offering)
    event.teacher_name = professor.full_name
    event.subject_id = offering.subject_id
    event.topic_id = None
    event.starts_at = session.starts_at
    event.ends_at = session.ends_at
    event.description = session.description
    event.join_url = session.join_url or (f"/live/{session.id}" if session.id else "")
    event.status = session.status
    event.color = "#453dee"


def student_ids_for_offering_query(offering: CourseOffering):
    if offering.track is None:
        return None
    return select(User.id).where(
            User.role == "student",
            User.is_active == True,  # noqa: E712
            User.niveau == offering.track.niveau,
            User.filiere == offering.track.filiere,
        )


async def notify_students_for_live(
    db: AsyncSession,
    session: LiveSession,
    offering: CourseOffering,
    event_name: str,
    title: str,
    body: str,
) -> bool:
    student_ids_query = student_ids_for_offering_query(offering)
    if student_ids_query is None:
        await db.flush()
        return True

    has_student = await db.scalar(student_ids_query.limit(1))
    if has_student is None:
        await db.flush()
        return True

    notification_rows = select(
        User.id,
        literal("live_session"),
        literal(title),
        literal(body),
    ).where(
        User.role == "student",
        User.is_active == True,  # noqa: E712
        User.niveau == offering.track.niveau,
        User.filiere == offering.track.filiere,
    )
    await db.execute(
        insert(Notification).from_select(
            [Notification.user_id, Notification.type, Notification.title, Notification.body],
            notification_rows,
        )
    )
    await db.flush()

    payload = {
        "live_session_id": session.id,
        "course_offering_id": session.course_offering_id,
        "calendar_event_id": session.calendar_event_id,
        "title": session.title,
        "starts_at": session.starts_at.isoformat(),
        "status": session.status,
    }
    await enqueue_realtime_event(
        db,
        channel=offering_notifications_channel_name(offering.id),
        event_name=event_name,
        payload=payload,
    )
    return True


async def list_professor_live_sessions(
    db: AsyncSession,
    *,
    professor: User,
    course_offering_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[ProfessorLiveSessionOut]:
    limit = min(max(limit, 1), MAX_PROFESSOR_LIVE_SESSIONS_LIMIT)
    offset = max(offset, 0)
    offerings = await professor_offerings(db, professor)
    allowed_ids = {offering.id for offering in offerings}
    if course_offering_id is not None:
        if course_offering_id not in allowed_ids:
            raise HTTPException(status_code=404, detail="Course offering not found")
        allowed_ids = {course_offering_id}
    if not allowed_ids:
        return []
    result = await db.execute(
        select(LiveSession)
        .where(LiveSession.course_offering_id.in_(allowed_ids))
        .order_by(LiveSession.starts_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return [professor_live_session_out(session) for session in result.scalars().all()]


async def reveal_professor_live_stream_credentials_state(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    live_session_id: int,
) -> LiveSessionStreamCredentialsOut:
    session = await require_professor_live_session(db, professor, live_session_id)
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_reveal",
        model_name="LiveSessionStreamCredentials",
        object_pk=session.id,
        object_repr=session.title,
        changed_data={
            "live_session_id": session.id,
            "has_stream_ingest_url": bool(session.stream_ingest_url),
            "has_stream_key": bool(session.stream_key),
        },
    )
    await db.commit()
    return LiveSessionStreamCredentialsOut(
        id=session.id,
        stream_ingest_url=session.stream_ingest_url,
        stream_key=session.stream_key,
    )


async def create_professor_live_session(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    body: LiveSessionIn,
    settings: Settings,
) -> ProfessorLiveSessionOut:
    offering = await require_professor_offering(db, professor, body.course_offering_id)
    if body.ends_at <= body.starts_at:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")
    await enforce_professor_mutation_rate_limit(db, professor, request)

    vdocipher_live_id = body.vdocipher_live_id.strip()
    created_stream: dict | None = None
    if not vdocipher_live_id and body.auto_create_vdocipher:
        created_stream = await create_live_stream(body.title, settings, chat_mode=body.chat_mode)
        vdocipher_live_id = created_stream["live_id"]
    if not vdocipher_live_id:
        raise HTTPException(status_code=400, detail="VdoCipher live ID is required")

    session = LiveSession(
        course_offering_id=body.course_offering_id,
        professor_user_id=professor.id,
        title=body.title,
        description=body.description,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        join_url=body.join_url.strip(),
        vdocipher_live_id=vdocipher_live_id,
        stream_ingest_url=(created_stream or {}).get("stream_ingest_url", body.stream_ingest_url.strip()),
        stream_key=(created_stream or {}).get("stream_key", body.stream_key.strip()),
        provider_payload_json=sanitize_provider_payload((created_stream or {}).get("raw", {})),
    )
    db.add(session)
    await db.flush()

    event = CalendarEvent(title=session.title, starts_at=session.starts_at, ends_at=session.ends_at)
    sync_calendar_event_from_live_session(event, session, offering, professor)
    db.add(event)
    await db.flush()
    event.preparation_href = f"/calendar?event={event.id}"
    session.calendar_event_id = event.id
    session.join_url = session.join_url or f"/live/{session.id}"
    sync_calendar_event_from_live_session(event, session, offering, professor)

    notification_delivered = await notify_students_for_live(
        db,
        session,
        offering,
        "live.session.created",
        "New live session scheduled",
        f"{session.title} was added to your calendar.",
    )
    session.notification_status = notification_status_from_realtime(notification_delivered)
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_create",
        model_name="LiveSession",
        object_pk=session.id,
        object_repr=session.title,
        changed_data={"course_offering_id": session.course_offering_id, "status": session.status},
    )
    await enqueue_live_session_event_and_track(db, session, "live.session.created")
    await db.commit()
    await db.refresh(session)
    return professor_live_session_out(session)


async def delete_professor_live_session(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    live_session_id: int,
) -> dict[str, bool]:
    session = await require_professor_live_session(db, professor, live_session_id, for_update=True)
    if session.status == LiveSessionStatus.LIVE:
        raise HTTPException(status_code=409, detail="End the live session before deleting it")
    await enforce_professor_mutation_rate_limit(db, professor, request)
    session_title = session.title
    if session.calendar_event:
        session.calendar_event.status = "cancelled"
    await db.delete(session)
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_delete",
        model_name="LiveSession",
        object_pk=live_session_id,
        object_repr=session_title,
    )
    await db.commit()
    return {"ok": True}


async def update_professor_live_session(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    live_session_id: int,
    body: LiveSessionUpdateIn,
) -> ProfessorLiveSessionOut:
    session = await require_professor_live_session(db, professor, live_session_id, for_update=True)
    await enforce_professor_mutation_rate_limit(db, professor, request)
    offering = session.course_offering
    if body.course_offering_id is not None and body.course_offering_id != session.course_offering_id:
        offering = await require_professor_offering(db, professor, body.course_offering_id)
        session.course_offering_id = offering.id
    if body.status is not None and body.status not in ALLOWED_LIVE_STATUSES:
        raise HTTPException(status_code=400, detail="Unsupported live session status")
    for field in ("title", "description", "starts_at", "ends_at", "join_url", "vdocipher_live_id", "stream_ingest_url", "stream_key", "status"):
        value = getattr(body, field)
        if value is not None:
            setattr(session, field, value.strip() if isinstance(value, str) else value)
    if not session.vdocipher_live_id:
        raise HTTPException(status_code=400, detail="VdoCipher live ID is required")
    if session.ends_at <= session.starts_at:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")
    if session.calendar_event:
        sync_calendar_event_from_live_session(session.calendar_event, session, offering, professor)
    notification_delivered = await notify_students_for_live(
        db,
        session,
        offering,
        "live.session.updated",
        "Live session updated",
        f"{session.title} was updated in your calendar.",
    )
    session.notification_status = notification_status_from_realtime(notification_delivered)
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSession",
        object_pk=session.id,
        object_repr=session.title,
        changed_data=body.model_dump(exclude_unset=True, mode="json"),
    )
    await enqueue_live_session_event_and_track(db, session, "live.session.updated")
    await db.commit()
    await db.refresh(session)
    return professor_live_session_out(session)


async def cancel_professor_live_session(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    live_session_id: int,
) -> ProfessorLiveSessionOut:
    session = await require_professor_live_session(db, professor, live_session_id, for_update=True)
    if session.status == LiveSessionStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Completed sessions cannot be cancelled")
    await enforce_professor_mutation_rate_limit(db, professor, request)
    session.status = LiveSessionStatus.CANCELLED
    if session.calendar_event:
        sync_calendar_event_from_live_session(session.calendar_event, session, session.course_offering, professor)
    notification_delivered = await notify_students_for_live(
        db,
        session,
        session.course_offering,
        "live.session.cancelled",
        "Live session cancelled",
        f"{session.title} was cancelled.",
    )
    session.notification_status = notification_status_from_realtime(notification_delivered)
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSession",
        object_pk=session.id,
        object_repr=session.title,
        changed_data={"status": LiveSessionStatus.CANCELLED.value},
    )
    await enqueue_live_session_event_and_track(db, session, "live.session.cancelled")
    await db.commit()
    await db.refresh(session)
    return professor_live_session_out(session)


async def notify_professor_live_session(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    live_session_id: int,
) -> ProfessorLiveSessionOut:
    session = await require_professor_live_session(db, professor, live_session_id, for_update=True)
    await enforce_professor_mutation_rate_limit(db, professor, request)
    notification_delivered = await notify_students_for_live(
        db,
        session,
        session.course_offering,
        "live.session.notify",
        "Upcoming live session",
        f"{session.title} is scheduled for {session.starts_at:%Y-%m-%d %H:%M}.",
    )
    session.notification_status = notification_status_from_realtime(notification_delivered)
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSession",
        object_pk=session.id,
        object_repr=session.title,
        changed_data={"notification_status": session.notification_status},
    )
    await enqueue_live_session_event_and_track(db, session, "live.session.notified")
    await db.commit()
    await db.refresh(session)
    return professor_live_session_out(session)


async def start_professor_live_session(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    live_session_id: int,
) -> ProfessorLiveSessionOut:
    session = await require_professor_live_session(db, professor, live_session_id, for_update=True)
    await enforce_professor_mutation_rate_limit(db, professor, request)
    session.status = LiveSessionStatus.LIVE
    if session.calendar_event:
        sync_calendar_event_from_live_session(session.calendar_event, session, session.course_offering, professor)
    notification_delivered = await notify_students_for_live(
        db,
        session,
        session.course_offering,
        "live.session.started",
        "Live session started",
        f"{session.title} is live now.",
    )
    session.notification_status = notification_status_from_realtime(notification_delivered)
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSession",
        object_pk=session.id,
        object_repr=session.title,
        changed_data={"status": LiveSessionStatus.LIVE.value},
    )
    await enqueue_live_session_event_and_track(db, session, "live.session.started")
    await db.commit()
    await db.refresh(session)
    return professor_live_session_out(session)


async def end_professor_live_session(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    live_session_id: int,
) -> ProfessorLiveSessionOut:
    session = await require_professor_live_session(db, professor, live_session_id, for_update=True)
    await enforce_professor_mutation_rate_limit(db, professor, request)
    session.status = LiveSessionStatus.COMPLETED
    if session.calendar_event:
        sync_calendar_event_from_live_session(session.calendar_event, session, session.course_offering, professor)
    notification_delivered = await notify_students_for_live(
        db,
        session,
        session.course_offering,
        "live.session.completed",
        "Live session ended",
        f"{session.title} has ended.",
    )
    session.notification_status = notification_status_from_realtime(notification_delivered)
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSession",
        object_pk=session.id,
        object_repr=session.title,
        changed_data={"status": LiveSessionStatus.COMPLETED.value},
    )
    await enqueue_live_session_event_and_track(db, session, "live.session.completed")
    await db.commit()
    await db.refresh(session)
    return professor_live_session_out(session)
