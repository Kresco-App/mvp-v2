import logging
from datetime import datetime, timezone

from fastapi import HTTPException, Request
from sqlalchemy import and_, insert, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.admin_audit import AdminAuditLog
from app.models.calendar import CalendarEvent
from app.models.notifications import Notification
from app.models.professor import CourseOffering, LiveSession
from app.models.users import User, UserSubjectEntitlement
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
from app.services.vdocipher import create_live_stream, delete_live_stream, sanitize_provider_payload

MAX_PROFESSOR_LIVE_SESSIONS_LIMIT = 100
LIVE_SESSION_NOTIFICATION_TYPE = "live_session"
LIVE_SESSION_NOTIFICATION_TIERS = ("pro", "vip", "platinum")

logger = logging.getLogger(__name__)


async def cleanup_created_vdocipher_live_stream_after_failure(
    db: AsyncSession,
    *,
    request: Request,
    professor_id: int,
    title: str,
    created_stream: dict,
    settings: Settings,
    failure: Exception,
) -> None:
    live_id = str(created_stream.get("live_id", "")).strip()
    if not live_id:
        logger.critical(
            "vdocipher_live_cleanup_missing_created_live_id",
            extra={"professor_user_id": professor_id, "persist_failure_type": type(failure).__name__},
        )
        return

    try:
        await db.rollback()
    except Exception:
        logger.warning(
            "vdocipher_live_cleanup_rollback_failed",
            exc_info=True,
            extra={"vdocipher_live_id": live_id, "professor_user_id": professor_id},
        )

    try:
        cleanup_result = await delete_live_stream(live_id, settings)
    except Exception as cleanup_exc:
        logger.exception(
            "vdocipher_live_cleanup_hook_failed",
            extra={"vdocipher_live_id": live_id, "professor_user_id": professor_id},
        )
        cleanup_result = {
            "cleanup_state": "cleanup_required",
            "cleanup_reason": "cleanup_hook_failed",
            "cleanup_error_type": type(cleanup_exc).__name__,
        }

    changed_data = {
        "provider": "vdocipher",
        "vdocipher_live_id": live_id,
        "cleanup": sanitize_provider_payload(cleanup_result),
        "cleanup_state": cleanup_result.get("cleanup_state", "unknown"),
        "cleanup_reason": cleanup_result.get("cleanup_reason", ""),
        "persist_failure_type": type(failure).__name__,
        "provider_payload": sanitize_provider_payload(created_stream.get("raw", {})),
    }
    if changed_data["cleanup_state"] != "deleted":
        logger.critical(
            "vdocipher_live_cleanup_required_after_persist_failure",
            extra={"vdocipher_live_cleanup": changed_data},
        )

    try:
        db.add(
            AdminAuditLog(
                action="provider_cleanup",
                model_name="VdoCipherLiveCleanup",
                object_pk=live_id,
                object_repr=title[:500],
                changed_data=changed_data,
                request_path=str(request.url.path),
                client_host=request.client.host if request.client else "",
                note=f"professor_user_id={professor_id}",
            )
        )
        await db.commit()
    except Exception:
        try:
            await db.rollback()
        except Exception:
            logger.warning(
                "vdocipher_live_cleanup_audit_rollback_failed",
                exc_info=True,
                extra={"vdocipher_live_id": live_id, "professor_user_id": professor_id},
            )
        logger.critical(
            "vdocipher_live_cleanup_audit_failed",
            exc_info=True,
            extra={"vdocipher_live_cleanup": changed_data},
        )


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


def user_live_session_feature_filter():
    return or_(
        User.tier.in_(LIVE_SESSION_NOTIFICATION_TIERS),
        and_(
            or_(User.tier.is_(None), User.tier == "", User.tier == "basic"),
            User.is_pro == True,  # noqa: E712
        ),
    )


def any_subject_entitlement_filter():
    return (
        select(UserSubjectEntitlement.id)
        .where(UserSubjectEntitlement.user_id == User.id)
        .exists()
    )


def active_subject_entitlement_filter(subject_id: int, now: datetime):
    return (
        select(UserSubjectEntitlement.id)
        .where(
            UserSubjectEntitlement.user_id == User.id,
            UserSubjectEntitlement.subject_id == subject_id,
            UserSubjectEntitlement.status == "active",
            or_(UserSubjectEntitlement.starts_at.is_(None), UserSubjectEntitlement.starts_at <= now),
            or_(UserSubjectEntitlement.ends_at.is_(None), UserSubjectEntitlement.ends_at >= now),
        )
        .exists()
    )


def student_ids_for_live_scope_query(
    *,
    subject_id: int,
    track_niveau: str,
    track_filiere: str,
):
    if not track_niveau or not track_filiere:
        return None
    now = datetime.now(timezone.utc)
    return select(User.id).where(
        User.role == "student",
        User.is_active == True,  # noqa: E712
        User.niveau == track_niveau,
        User.filiere == track_filiere,
        user_live_session_feature_filter(),
        or_(
            ~any_subject_entitlement_filter(),
            active_subject_entitlement_filter(subject_id, now),
        ),
    )


def student_ids_for_offering_query(offering: CourseOffering):
    if offering.track is None:
        return None
    return student_ids_for_live_scope_query(
        subject_id=offering.subject_id,
        track_niveau=offering.track.niveau,
        track_filiere=offering.track.filiere,
    )


def live_notification_already_sent_filter(user_id_column, title: str, body: str):
    return (
        select(Notification.id)
        .where(
            Notification.user_id == user_id_column,
            Notification.type == LIVE_SESSION_NOTIFICATION_TYPE,
            Notification.title == title,
            Notification.body == body,
        )
        .exists()
    )


async def notify_students_for_live(
    db: AsyncSession,
    session: LiveSession,
    offering: CourseOffering | None,
    event_name: str,
    title: str,
    body: str,
    *,
    offering_id: int | None = None,
    subject_id: int | None = None,
    track_niveau: str = "",
    track_filiere: str = "",
) -> bool:
    if offering is not None:
        offering_id = offering.id
        subject_id = offering.subject_id
        track_niveau = offering.track.niveau if offering.track else ""
        track_filiere = offering.track.filiere if offering.track else ""

    if offering_id is None or subject_id is None:
        await db.flush()
        return True

    student_ids_query = student_ids_for_live_scope_query(
        subject_id=subject_id,
        track_niveau=track_niveau,
        track_filiere=track_filiere,
    )
    if student_ids_query is None:
        await db.flush()
        return True

    student_ids = student_ids_query.subquery()
    duplicate_notification_exists = live_notification_already_sent_filter(student_ids.c.id, title, body)
    has_unsent_student = await db.scalar(
        select(student_ids.c.id)
        .where(~duplicate_notification_exists)
        .limit(1)
    )
    if has_unsent_student is None:
        await db.flush()
        return True

    notification_rows = select(
        student_ids.c.id,
        literal(LIVE_SESSION_NOTIFICATION_TYPE),
        literal(title),
        literal(body),
    ).where(
        ~duplicate_notification_exists,
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
        channel=offering_notifications_channel_name(offering_id),
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

    calendar_subtitle = live_calendar_subtitle(offering)
    professor_name = professor.full_name
    professor_id = professor.id
    subject_id = offering.subject_id
    track_niveau = offering.track.niveau if offering.track else ""
    track_filiere = offering.track.filiere if offering.track else ""
    offering_id = offering.id

    await db.rollback()

    vdocipher_live_id = body.vdocipher_live_id.strip()
    created_stream: dict | None = None
    if not vdocipher_live_id and body.auto_create_vdocipher:
        created_stream = await create_live_stream(body.title, settings, chat_mode=body.chat_mode)
        vdocipher_live_id = created_stream["live_id"]
    if not vdocipher_live_id:
        raise HTTPException(status_code=400, detail="VdoCipher live ID is required")

    try:
        session = LiveSession(
            course_offering_id=body.course_offering_id,
            professor_user_id=professor_id,
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
        event.event_type = "live_session"
        event.title = session.title
        event.subtitle = calendar_subtitle
        event.teacher_name = professor_name
        event.subject_id = subject_id
        event.topic_id = None
        event.starts_at = session.starts_at
        event.ends_at = session.ends_at
        event.description = session.description
        event.join_url = session.join_url or f"/live/{session.id}"
        event.status = session.status
        event.color = "#453dee"
        db.add(event)
        await db.flush()
        event.preparation_href = f"/calendar?event={event.id}"
        session.calendar_event_id = event.id
        session.join_url = session.join_url or f"/live/{session.id}"

        notification_delivered = await notify_students_for_live(
            db,
            session,
            None,
            "live.session.created",
            "New live session scheduled",
            f"{session.title} was added to your calendar.",
            offering_id=offering_id,
            subject_id=subject_id,
            track_niveau=track_niveau,
            track_filiere=track_filiere,
        )
        session.notification_status = notification_status_from_realtime(notification_delivered)
        record_professor_audit(
            db,
            professor_id=professor_id,
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
    except Exception as exc:
        if created_stream is not None:
            await cleanup_created_vdocipher_live_stream_after_failure(
                db,
                request=request,
                professor_id=professor_id,
                title=body.title,
                created_stream=created_stream,
                settings=settings,
                failure=exc,
            )
        raise


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


async def _apply_professor_live_session_transition(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    session: LiveSession,
    target_status: LiveSessionStatus | None,
    notification_event_name: str,
    notification_title: str,
    notification_body: str,
    realtime_event_name: str,
) -> ProfessorLiveSessionOut:
    await enforce_professor_mutation_rate_limit(db, professor, request)
    if target_status is not None:
        session.status = target_status
        if session.calendar_event:
            sync_calendar_event_from_live_session(session.calendar_event, session, session.course_offering, professor)

    notification_delivered = await notify_students_for_live(
        db,
        session,
        session.course_offering,
        notification_event_name,
        notification_title,
        notification_body,
    )
    session.notification_status = notification_status_from_realtime(notification_delivered)
    changed_data = (
        {"status": target_status.value}
        if target_status is not None
        else {"notification_status": session.notification_status}
    )
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSession",
        object_pk=session.id,
        object_repr=session.title,
        changed_data=changed_data,
    )
    await enqueue_live_session_event_and_track(db, session, realtime_event_name)
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
    return await _apply_professor_live_session_transition(
        db,
        professor=professor,
        request=request,
        session=session,
        target_status=LiveSessionStatus.CANCELLED,
        notification_event_name="live.session.cancelled",
        notification_title="Live session cancelled",
        notification_body=f"{session.title} was cancelled.",
        realtime_event_name="live.session.cancelled",
    )


async def notify_professor_live_session(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    live_session_id: int,
) -> ProfessorLiveSessionOut:
    session = await require_professor_live_session(db, professor, live_session_id, for_update=True)
    return await _apply_professor_live_session_transition(
        db,
        professor=professor,
        request=request,
        session=session,
        target_status=None,
        notification_event_name="live.session.notify",
        notification_title="Upcoming live session",
        notification_body=f"{session.title} is scheduled for {session.starts_at:%Y-%m-%d %H:%M}.",
        realtime_event_name="live.session.notified",
    )


async def start_professor_live_session(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    live_session_id: int,
) -> ProfessorLiveSessionOut:
    session = await require_professor_live_session(db, professor, live_session_id, for_update=True)
    return await _apply_professor_live_session_transition(
        db,
        professor=professor,
        request=request,
        session=session,
        target_status=LiveSessionStatus.LIVE,
        notification_event_name="live.session.started",
        notification_title="Live session started",
        notification_body=f"{session.title} is live now.",
        realtime_event_name="live.session.started",
    )


async def end_professor_live_session(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    live_session_id: int,
) -> ProfessorLiveSessionOut:
    session = await require_professor_live_session(db, professor, live_session_id, for_update=True)
    return await _apply_professor_live_session_transition(
        db,
        professor=professor,
        request=request,
        session=session,
        target_status=LiveSessionStatus.COMPLETED,
        notification_event_name="live.session.completed",
        notification_title="Live session ended",
        notification_body=f"{session.title} has ended.",
        realtime_event_name="live.session.completed",
    )
