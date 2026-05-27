from datetime import datetime, timedelta, timezone
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import Settings, get_settings
from app.dependencies import get_current_professor_user, get_current_user, get_db, require_professor_active_offering
from app.models.admin_audit import AdminAuditLog
from app.models.calendar import CalendarEvent
from app.models.courses import TabContent, Topic, TopicItem
from app.models.notifications import Notification
from app.models.professor import (
    CourseOffering,
    LiveSession,
    LiveSessionCheckpoint,
    LiveSessionInteraction,
    ProfessorChangeRequest,
    ProfessorChatConversation,
    ProfessorChatMessage,
    ProgramTrack,
)
from app.models.users import User
from app.schemas.professor import (
    ChatConversationPatchIn,
    ChatMessageIn,
    ChatMessagePatchIn,
    ChatParticipantOut,
    CourseOfferingOut,
    LiveSessionEmbedOut,
    LiveSessionCheckpointIn,
    LiveSessionCheckpointOut,
    LiveSessionCheckpointPatchIn,
    LiveSessionIn,
    LiveSessionInteractionIn,
    LiveSessionInteractionOut,
    LiveSessionInteractionPatchIn,
    LiveSessionOut,
    LiveSessionStreamCredentialsOut,
    LiveSessionUpdateIn,
    LiveSessionViewerOut,
    LiveProviderConfigOut,
    ProfessorLiveSessionOut,
    ProfessorChangeRequestIn,
    ProfessorChangeRequestOut,
    ProfessorChatConversationOut,
    ProfessorChatMessageOut,
    ProfessorDashboardOut,
    ProgramTrackOut,
    StudentProfessorChatStatusOut,
    StudentProfessorThreadOut,
    StudentStartConversationIn,
)
from app.services.access import FeatureAccessRequirement, build_access_context
from app.services.ably import live_session_channel_name, offering_notifications_channel_name
from app.services.image_uploads import (
    allowed_image_extension,
    image_matches_mime_type,
    normalize_image_mime_type,
)
from app.services.media_storage import get_media_storage, media_url, professor_chat_media_key, safe_original_filename
from app.services.professor_chat_access import (
    professor_chat_eligibility,
    professor_chat_offering_mismatch_reason,
)
from app.services.realtime_outbox import enqueue_realtime_event
from app.services.vdocipher import create_live_stream, get_live_embed_url, sanitize_provider_payload

router = APIRouter(tags=["Professor"])
logger = logging.getLogger(__name__)

ALLOWED_CHANGE_TARGETS = {"topic", "topic_item", "tab_content"}
ALLOWED_LIVE_STATUSES = {"scheduled", "live", "completed", "cancelled"}
ALLOWED_LIVE_INTERACTION_KINDS = {"question", "message"}
ALLOWED_LIVE_INTERACTION_STATUSES = {"pending", "answered", "hidden", "deleted"}
ALLOWED_LIVE_CHECKPOINT_TYPES = {"prompt", "quiz"}
ALLOWED_LIVE_CHECKPOINT_STATUSES = {"active", "closed", "deleted"}
LIVE_INTERACTION_BURST_LIMIT = 8
LIVE_INTERACTION_BURST_WINDOW = timedelta(seconds=10)
LIVE_SESSION_ACCESS_REQUIREMENT = FeatureAccessRequirement("live_sessions")
LIVE_NOTIFICATION_SENT = "sent"
LIVE_NOTIFICATION_REALTIME_FAILED = "realtime_failed"
MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024
CHAT_MESSAGE_EDIT_WINDOW = timedelta(minutes=15)
PROFESSOR_MUTATION_BURST_LIMIT = 12
PROFESSOR_MUTATION_BURST_WINDOW = timedelta(minutes=1)


def _live_session_is_joinable(session: LiveSession, now: datetime | None = None) -> bool:
    if not session.vdocipher_live_id or session.status != "live":
        return False
    current_time = now or datetime.now(timezone.utc)
    ends_at = session.ends_at
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)
    return ends_at >= current_time


async def _enforce_professor_mutation_rate_limit(db: AsyncSession, professor: User, request: Request) -> None:
    window_start = datetime.now(timezone.utc) - PROFESSOR_MUTATION_BURST_WINDOW
    marker = f"professor_user_id={professor.id}"
    count = await db.scalar(
        select(func.count())
        .select_from(AdminAuditLog)
        .where(
            AdminAuditLog.note == marker,
            AdminAuditLog.request_path == str(request.url.path),
            AdminAuditLog.created_at >= window_start,
        )
    )
    if (count or 0) >= PROFESSOR_MUTATION_BURST_LIMIT:
        raise HTTPException(status_code=429, detail="Slow down before submitting more professor changes")


def _record_professor_audit(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    action: str,
    model_name: str,
    object_pk: int | str,
    object_repr: str,
    changed_data: dict | None = None,
) -> None:
    db.add(
        AdminAuditLog(
            action=action,
            model_name=model_name,
            object_pk=str(object_pk),
            object_repr=object_repr[:500],
            changed_data=changed_data or {},
            request_path=str(request.url.path),
            client_host=request.client.host if request.client else "",
            note=f"professor_user_id={professor.id}",
        )
    )


def _participant_out(user: User, settings: Settings) -> ChatParticipantOut:
    return ChatParticipantOut(
        id=user.id,
        full_name=user.full_name,
        avatar_url=media_url(user.avatar_url, settings),
        tier=getattr(user, "tier", "basic") or "basic",
    )


def _offering_out(offering: CourseOffering) -> CourseOfferingOut:
    subject_title = offering.subject.title if offering.subject else ""
    track = ProgramTrackOut.model_validate(offering.track)
    return CourseOfferingOut(
        id=offering.id,
        subject_id=offering.subject_id,
        subject_title=subject_title,
        track=track,
        professor_user_id=offering.professor_user_id,
        title=offering.title or f"{subject_title} - {track.title or track.filiere}",
        status=offering.status,
    )


def _live_viewer_out(session: LiveSession) -> LiveSessionViewerOut:
    offering = session.course_offering
    track = offering.track if offering else None
    subject = offering.subject if offering else None
    return LiveSessionViewerOut(
        id=session.id,
        course_offering_id=session.course_offering_id,
        title=session.title,
        description=session.description,
        starts_at=session.starts_at,
        ends_at=session.ends_at,
        status=session.status,
        join_url=session.join_url,
        vdocipher_live_id=session.vdocipher_live_id,
        notification_status=session.notification_status,
        created_at=session.created_at,
        offering_title=offering.title if offering else "",
        subject_title=subject.title if subject else "",
        niveau=track.niveau if track else "",
        filiere=track.filiere if track else "",
        teacher_name=session.professor.full_name if session.professor else "",
        viewer_url=f"/live/{session.id}",
        can_join=_live_session_is_joinable(session),
    )


def _professor_live_session_out(session: LiveSession) -> ProfessorLiveSessionOut:
    return ProfessorLiveSessionOut(
        id=session.id,
        course_offering_id=session.course_offering_id,
        title=session.title,
        description=session.description,
        starts_at=session.starts_at,
        ends_at=session.ends_at,
        status=session.status,
        join_url=session.join_url,
        vdocipher_live_id=session.vdocipher_live_id,
        notification_status=session.notification_status,
        created_at=session.created_at,
        has_stream_credentials=bool(session.stream_ingest_url or session.stream_key),
    )


def _live_interaction_out(interaction: LiveSessionInteraction) -> LiveSessionInteractionOut:
    return LiveSessionInteractionOut(
        id=interaction.id,
        live_session_id=interaction.live_session_id,
        course_offering_id=interaction.course_offering_id,
        professor_user_id=interaction.professor_user_id,
        student_user_id=interaction.student_user_id,
        student_name=interaction.student.full_name if interaction.student else "",
        kind=interaction.kind,
        body=interaction.body,
        status=interaction.status,
        answer=interaction.answer or "",
        answered_by_user_id=interaction.answered_by_user_id,
        answered_at=interaction.answered_at,
        deleted_at=interaction.deleted_at,
        created_at=interaction.created_at,
        updated_at=interaction.updated_at,
    )


def _live_session_realtime_payload(session: LiveSession) -> dict:
    return {
        "live_session_id": session.id,
        "title": session.title,
        "status": session.status,
        "starts_at": session.starts_at.isoformat(),
        "ends_at": session.ends_at.isoformat(),
    }


async def _enqueue_live_session_event(db: AsyncSession, live_session_id: int, event_name: str, payload: dict) -> None:
    await enqueue_realtime_event(
        db,
        channel=live_session_channel_name(live_session_id),
        event_name=event_name,
        payload=payload,
    )


async def _enqueue_live_session_event_and_track(db: AsyncSession, session: LiveSession, event_name: str) -> None:
    await _enqueue_live_session_event(db, session.id, event_name, _live_session_realtime_payload(session))


def _clean_live_interaction_body(body: str) -> str:
    clean_body = body.strip()
    if not clean_body:
        raise HTTPException(status_code=422, detail="Message body is required")
    return clean_body


def _normalize_live_interaction_kind(kind: str) -> str:
    normalized = kind.strip().casefold()
    if normalized not in ALLOWED_LIVE_INTERACTION_KINDS:
        raise HTTPException(status_code=400, detail="Unsupported live interaction kind")
    return normalized


async def _enforce_live_interaction_burst_limit(db: AsyncSession, live_session_id: int, user: User) -> None:
    window_start = datetime.now(timezone.utc) - LIVE_INTERACTION_BURST_WINDOW
    count = await db.scalar(
        select(func.count())
        .select_from(LiveSessionInteraction)
        .where(
            LiveSessionInteraction.live_session_id == live_session_id,
            LiveSessionInteraction.student_user_id == user.id,
            LiveSessionInteraction.created_at >= window_start,
        )
    )
    if (count or 0) >= LIVE_INTERACTION_BURST_LIMIT:
        raise HTTPException(status_code=429, detail="Slow down before sending another live message")


def _conversation_out(conversation: ProfessorChatConversation, settings: Settings) -> ProfessorChatConversationOut:
    offering = conversation.course_offering
    subject_title = offering.subject.title if offering and offering.subject else ""
    track = offering.track if offering else None
    return ProfessorChatConversationOut(
        id=conversation.id,
        course_offering_id=conversation.course_offering_id,
        offering_title=offering.title if offering else "",
        subject_title=subject_title,
        niveau=track.niveau if track else "",
        filiere=track.filiere if track else "",
        professor=_participant_out(conversation.professor, settings),
        student=_participant_out(conversation.student, settings),
        status=conversation.status,
        last_message_preview=conversation.last_message_preview,
        unread_for_professor=conversation.unread_for_professor,
        unread_for_student=conversation.unread_for_student,
        is_pinned_by_professor=conversation.is_pinned_by_professor,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        last_message_at=conversation.last_message_at,
    )


async def _conversation_last_sender_role(db: AsyncSession, conversation_ids: list[int]) -> dict[int, str]:
    if not conversation_ids:
        return {}

    result = await db.execute(
        select(ProfessorChatMessage.conversation_id, User.role)
        .join(User, User.id == ProfessorChatMessage.sender_user_id)
        .where(ProfessorChatMessage.conversation_id.in_(conversation_ids))
        .order_by(ProfessorChatMessage.conversation_id, ProfessorChatMessage.created_at.desc(), ProfessorChatMessage.id.desc())
    )
    roles: dict[int, str] = {}
    for conversation_id, role in result.all():
        if conversation_id not in roles:
            roles[conversation_id] = role
    return roles


async def _student_teacher_threads(
    db: AsyncSession,
    offerings: list[CourseOffering],
    conversations: list[ProfessorChatConversation],
    settings: Settings,
) -> list[StudentProfessorThreadOut]:
    conversations_by_offering = {conversation.course_offering_id: conversation for conversation in conversations}
    last_sender_roles = await _conversation_last_sender_role(db, [conversation.id for conversation in conversations])
    threads: list[StudentProfessorThreadOut] = []

    for offering in offerings:
        conversation = conversations_by_offering.get(offering.id)
        track = offering.track
        conversation_out = _conversation_out(conversation, settings) if conversation else None
        threads.append(
            StudentProfessorThreadOut(
                course_offering_id=offering.id,
                offering_title=offering.title,
                subject_title=offering.subject.title if offering.subject else "",
                niveau=track.niveau if track else "",
                filiere=track.filiere if track else "",
                professor=_participant_out(offering.professor, settings),
                conversation=conversation_out,
                last_message_preview=conversation.last_message_preview if conversation else "",
                last_message_sender_role=last_sender_roles.get(conversation.id, "") if conversation else "",
                unread_count=conversation.unread_for_student if conversation else 0,
                last_message_at=conversation.last_message_at if conversation else None,
            )
        )

    return sorted(
        threads,
        key=lambda thread: (
            thread.last_message_at is None,
            -(_chat_datetime(thread.last_message_at).timestamp() if thread.last_message_at else 0),
            thread.professor.full_name.casefold(),
            thread.subject_title.casefold(),
        ),
    )


async def _professor_offerings(db: AsyncSession, professor: User) -> list[CourseOffering]:
    result = await db.execute(
        select(CourseOffering)
        .options(selectinload(CourseOffering.subject), selectinload(CourseOffering.track))
        .where(CourseOffering.professor_user_id == professor.id, CourseOffering.status == "active")
        .order_by(CourseOffering.id)
    )
    return list(result.scalars().all())


async def _require_professor_offering(db: AsyncSession, professor: User, offering_id: int) -> CourseOffering:
    result = await db.execute(
        select(CourseOffering)
        .options(selectinload(CourseOffering.subject), selectinload(CourseOffering.track))
        .where(
            CourseOffering.id == offering_id,
            CourseOffering.professor_user_id == professor.id,
            CourseOffering.status == "active",
        )
    )
    offering = result.scalar_one_or_none()
    if offering is None:
        raise HTTPException(status_code=404, detail="Course offering not found")
    return offering


async def _require_professor_live_session(db: AsyncSession, professor: User, live_session_id: int) -> LiveSession:
    result = await db.execute(
        select(LiveSession)
        .options(
            selectinload(LiveSession.calendar_event),
            selectinload(LiveSession.course_offering).selectinload(CourseOffering.subject),
            selectinload(LiveSession.course_offering).selectinload(CourseOffering.track),
        )
        .where(LiveSession.id == live_session_id, LiveSession.professor_user_id == professor.id)
    )
    live_session = result.scalar_one_or_none()
    if live_session is None:
        raise HTTPException(status_code=404, detail="Live session not found")
    return live_session


async def _student_offerings(db: AsyncSession, student: User) -> list[CourseOffering]:
    result = await db.execute(
        select(CourseOffering)
        .join(ProgramTrack, ProgramTrack.id == CourseOffering.track_id)
        .options(
            selectinload(CourseOffering.subject),
            selectinload(CourseOffering.track),
            selectinload(CourseOffering.professor),
        )
        .where(
            CourseOffering.status == "active",
            ProgramTrack.status == "active",
            ProgramTrack.niveau == student.niveau,
            ProgramTrack.filiere == student.filiere,
        )
        .order_by(CourseOffering.id)
    )
    return list(result.scalars().all())


def _ensure_student_professor_chat_access(user: User) -> None:
    eligibility = professor_chat_eligibility(user)
    if not eligibility.eligible:
        raise HTTPException(status_code=403, detail=eligibility.reason)


def _ensure_student_matches_offering(student: User, offering: CourseOffering) -> None:
    reason = professor_chat_offering_mismatch_reason(student, offering)
    if reason:
        raise HTTPException(status_code=403, detail=reason)


async def _require_professor_conversation(
    db: AsyncSession,
    professor: User,
    conversation_id: int,
    *,
    for_update: bool = False,
) -> ProfessorChatConversation:
    stmt = (
        select(ProfessorChatConversation)
        .options(
            selectinload(ProfessorChatConversation.course_offering).selectinload(CourseOffering.subject),
            selectinload(ProfessorChatConversation.course_offering).selectinload(CourseOffering.track),
            selectinload(ProfessorChatConversation.professor),
            selectinload(ProfessorChatConversation.student),
        )
        .where(
            ProfessorChatConversation.id == conversation_id,
            ProfessorChatConversation.professor_user_id == professor.id,
        )
    )
    if for_update:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


async def _require_student_conversation(
    db: AsyncSession,
    student: User,
    conversation_id: int,
    *,
    for_update: bool = False,
) -> ProfessorChatConversation:
    stmt = (
        select(ProfessorChatConversation)
        .options(
            selectinload(ProfessorChatConversation.course_offering).selectinload(CourseOffering.subject),
            selectinload(ProfessorChatConversation.course_offering).selectinload(CourseOffering.track),
            selectinload(ProfessorChatConversation.professor),
            selectinload(ProfessorChatConversation.student),
        )
        .where(
            ProfessorChatConversation.id == conversation_id,
            ProfessorChatConversation.student_user_id == student.id,
        )
    )
    if for_update:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


async def _require_student_live_session(db: AsyncSession, student: User, live_session_id: int) -> LiveSession:
    result = await db.execute(
        select(LiveSession)
        .join(CourseOffering, CourseOffering.id == LiveSession.course_offering_id)
        .join(ProgramTrack, ProgramTrack.id == CourseOffering.track_id)
        .options(
            selectinload(LiveSession.course_offering).selectinload(CourseOffering.subject),
            selectinload(LiveSession.course_offering).selectinload(CourseOffering.track),
            selectinload(LiveSession.professor),
        )
        .where(
            LiveSession.id == live_session_id,
            LiveSession.status != "cancelled",
            ProgramTrack.niveau == student.niveau,
            ProgramTrack.filiere == student.filiere,
        )
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Live session not found")
    access_context = await build_access_context(db, student)
    access = access_context.decide_for(
        LIVE_SESSION_ACCESS_REQUIREMENT,
        subject_id=session.course_offering.subject_id,
    )
    if not access.can_access:
        raise HTTPException(status_code=403, detail=access.locked_reason)
    return session


async def _require_professor_live_interaction(db: AsyncSession, professor: User, interaction_id: int) -> LiveSessionInteraction:
    result = await db.execute(
        select(LiveSessionInteraction)
        .options(selectinload(LiveSessionInteraction.student))
        .where(
            LiveSessionInteraction.id == interaction_id,
            LiveSessionInteraction.professor_user_id == professor.id,
        )
    )
    interaction = result.scalar_one_or_none()
    if interaction is None:
        raise HTTPException(status_code=404, detail="Live interaction not found")
    return interaction


async def _require_professor_live_checkpoint(db: AsyncSession, professor: User, checkpoint_id: int) -> LiveSessionCheckpoint:
    checkpoint = await db.scalar(
        select(LiveSessionCheckpoint).where(
            LiveSessionCheckpoint.id == checkpoint_id,
            LiveSessionCheckpoint.professor_user_id == professor.id,
        )
    )
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="Live checkpoint not found")
    return checkpoint


async def _messages_for_conversation(
    db: AsyncSession,
    conversation_id: int,
    settings: Settings,
    *,
    limit: int = 100,
    before_id: int | None = None,
) -> list[ProfessorChatMessageOut]:
    stmt = (
        select(ProfessorChatMessage, User.role)
        .join(User, User.id == ProfessorChatMessage.sender_user_id)
        .where(ProfessorChatMessage.conversation_id == conversation_id)
    )
    if before_id is not None:
        stmt = stmt.where(ProfessorChatMessage.id < before_id)
    stmt = stmt.order_by(ProfessorChatMessage.created_at.desc(), ProfessorChatMessage.id.desc()).limit(limit)
    result = await db.execute(stmt)
    rows = list(result.all())
    rows.reverse()
    return [
        _message_out(message, role, settings)
        for message, role in rows
    ]


def _touch_conversation(conversation: ProfessorChatConversation, body: str) -> None:
    now = datetime.now(timezone.utc)
    conversation.last_message_preview = body.strip().replace("\n", " ")[:255] or "Image"
    conversation.last_message_at = now
    conversation.updated_at = now


async def _apply_professor_sent_message_update(
    db: AsyncSession,
    conversation: ProfessorChatConversation,
    body: str,
) -> None:
    _touch_conversation(conversation, body)
    await db.execute(
        update(ProfessorChatConversation)
        .where(ProfessorChatConversation.id == conversation.id)
        .values(
            unread_for_student=ProfessorChatConversation.unread_for_student + 1,
            unread_for_professor=0,
            last_message_preview=conversation.last_message_preview,
            last_message_at=conversation.last_message_at,
            updated_at=conversation.updated_at,
        )
        .execution_options(synchronize_session=False)
    )


async def _apply_student_sent_message_update(
    db: AsyncSession,
    conversation: ProfessorChatConversation,
    body: str,
) -> None:
    _touch_conversation(conversation, body)
    await db.execute(
        update(ProfessorChatConversation)
        .where(ProfessorChatConversation.id == conversation.id)
        .values(
            unread_for_professor=ProfessorChatConversation.unread_for_professor + 1,
            unread_for_student=0,
            last_message_preview=conversation.last_message_preview,
            last_message_at=conversation.last_message_at,
            updated_at=conversation.updated_at,
        )
        .execution_options(synchronize_session=False)
    )


def _chat_datetime(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


async def _refresh_chat_preview(db: AsyncSession, conversation: ProfessorChatConversation) -> None:
    message = await db.scalar(
        select(ProfessorChatMessage)
        .where(ProfessorChatMessage.conversation_id == conversation.id)
        .order_by(ProfessorChatMessage.created_at.desc(), ProfessorChatMessage.id.desc())
        .limit(1)
    )
    now = datetime.now(timezone.utc)
    if message is None:
        conversation.last_message_preview = ""
        conversation.last_message_at = now
    else:
        conversation.last_message_preview = message.body.strip().replace("\n", " ")[:255] or "Image"
        conversation.last_message_at = message.created_at
    conversation.updated_at = now


async def _require_owned_chat_message(
    db: AsyncSession,
    user: User,
    message_id: int,
) -> tuple[ProfessorChatMessage, ProfessorChatConversation]:
    result = await db.execute(
        select(ProfessorChatMessage, ProfessorChatConversation)
        .join(ProfessorChatConversation, ProfessorChatConversation.id == ProfessorChatMessage.conversation_id)
        .where(
            ProfessorChatMessage.id == message_id,
            ProfessorChatMessage.sender_user_id == user.id,
            or_(
                ProfessorChatConversation.professor_user_id == user.id,
                ProfessorChatConversation.student_user_id == user.id,
            ),
        )
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Chat message not found")
    return row[0], row[1]


async def publish_chat_message_change(
    db: AsyncSession,
    conversation: ProfessorChatConversation,
    user: User,
    event_name: str,
    message_id: int,
) -> None:
    if user.id == conversation.professor_user_id:
        channel = f"kresco:user:{conversation.student_user_id}:notifications"
        payload = {"conversation_id": conversation.id, "message_id": message_id, "preview": conversation.last_message_preview}
    else:
        channel = f"kresco:professor:{conversation.professor_user_id}:inbox"
        payload = {
            "conversation_id": conversation.id,
            "message_id": message_id,
            "student_user_id": user.id,
            "preview": conversation.last_message_preview,
        }
    await enqueue_realtime_event(db, channel=channel, event_name=event_name, payload=payload)


def _message_out(message: ProfessorChatMessage, sender_role: str, settings: Settings) -> ProfessorChatMessageOut:
    return ProfessorChatMessageOut(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_user_id=message.sender_user_id,
        sender_role=sender_role,
        body=message.body,
        attachment_url=media_url(message.attachment_url, settings),
        attachment_mime_type=message.attachment_mime_type or "",
        attachment_name=message.attachment_name or "",
        attachment_size=message.attachment_size or 0,
        status=message.status,
        created_at=message.created_at,
        read_at=message.read_at,
    )


async def _chat_media_used_bytes(db: AsyncSession, conversation_id: int) -> int:
    used = await db.scalar(
        select(func.coalesce(func.sum(ProfessorChatMessage.attachment_size), 0))
        .where(
            ProfessorChatMessage.conversation_id == conversation_id,
            ProfessorChatMessage.attachment_size > 0,
        )
    )
    return int(used or 0)


async def _save_chat_image(db: AsyncSession, settings: Settings, conversation_id: int, file: UploadFile) -> tuple[str, str, str, int]:
    mime_type = normalize_image_mime_type(file.content_type)
    extension = allowed_image_extension(mime_type)
    if extension is None:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG, WEBP, or GIF image")

    content = await file.read(MAX_CHAT_IMAGE_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Upload a non-empty image")
    if len(content) > MAX_CHAT_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 5 MB or smaller")
    if not image_matches_mime_type(content, mime_type):
        raise HTTPException(status_code=400, detail="Upload a valid JPG, PNG, WEBP, or GIF image")
    used_bytes = await _chat_media_used_bytes(db, conversation_id)
    if used_bytes + len(content) > int(settings.media_chat_conversation_quota_bytes):
        raise HTTPException(status_code=413, detail="Conversation media quota exceeded")

    safe_original = safe_original_filename(file.filename, "chat-image")
    stored = await get_media_storage(settings).put_object(
        key=professor_chat_media_key(conversation_id, extension),
        content=content,
        content_type=mime_type,
    )
    return (
        stored.reference,
        mime_type,
        safe_original,
        len(content),
    )


def _topic_offering_id(topic: Topic) -> int | None:
    return getattr(topic, "course_offering_id", None)


async def _target_belongs_to_offering(db: AsyncSession, offering_id: int, target_type: str, target_id: int) -> bool:
    if target_type == "topic":
        topic = await db.scalar(select(Topic).where(Topic.id == target_id))
        return bool(topic and _topic_offering_id(topic) == offering_id)
    if target_type == "topic_item":
        result = await db.execute(
            select(TopicItem).options(selectinload(TopicItem.topic)).where(TopicItem.id == target_id)
        )
        item = result.scalar_one_or_none()
        return bool(item and item.topic and _topic_offering_id(item.topic) == offering_id)
    if target_type == "tab_content":
        result = await db.execute(
            select(TabContent)
            .options(selectinload(TabContent.topic_item).selectinload(TopicItem.topic))
            .where(TabContent.id == target_id)
        )
        tab = result.scalar_one_or_none()
        return bool(tab and tab.topic_item and tab.topic_item.topic and _topic_offering_id(tab.topic_item.topic) == offering_id)
    return False


def _live_calendar_subtitle(offering: CourseOffering) -> str:
    subject_title = offering.subject.title if offering.subject else ""
    track_title = offering.track.title if offering.track else ""
    return " - ".join(part for part in [subject_title, track_title] if part)


def _sync_calendar_event_from_live_session(event: CalendarEvent, session: LiveSession, offering: CourseOffering, professor: User) -> None:
    event.event_type = "live_session"
    event.title = session.title
    event.subtitle = _live_calendar_subtitle(offering)
    event.teacher_name = professor.full_name
    event.subject_id = offering.subject_id
    event.topic_id = None
    event.starts_at = session.starts_at
    event.ends_at = session.ends_at
    event.description = session.description
    event.join_url = session.join_url or (f"/live/{session.id}" if session.id else "")
    event.status = session.status
    event.color = "#453dee"


async def _students_for_offering(db: AsyncSession, offering: CourseOffering) -> list[User]:
    if offering.track is None:
        return []
    result = await db.execute(
        select(User).where(
            User.role == "student",
            User.is_active == True,  # noqa: E712
            User.niveau == offering.track.niveau,
            User.filiere == offering.track.filiere,
        )
    )
    return list(result.scalars().all())


async def _notify_students_for_live(
    db: AsyncSession,
    session: LiveSession,
    offering: CourseOffering,
    event_name: str,
    title: str,
    body: str,
) -> bool:
    students = await _students_for_offering(db, offering)
    for student in students:
        db.add(Notification(user_id=student.id, type="live_session", title=title, body=body))
    await db.flush()
    if not students:
        return True

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


def _notification_status_from_realtime(delivered: bool) -> str:
    return LIVE_NOTIFICATION_SENT if delivered else LIVE_NOTIFICATION_REALTIME_FAILED


@router.get("/dashboard", response_model=ProfessorDashboardOut)
async def get_professor_dashboard(
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    offerings = await _professor_offerings(db, professor)
    offering_ids = [offering.id for offering in offerings]
    live_sessions: list[LiveSession] = []
    change_requests: list[ProfessorChangeRequest] = []
    chat_unread_count = 0
    chat_pinned_count = 0

    if offering_ids:
        live_result = await db.execute(
            select(LiveSession)
            .where(LiveSession.course_offering_id.in_(offering_ids), LiveSession.status.in_(["scheduled", "live"]))
            .order_by(LiveSession.starts_at)
            .limit(5)
        )
        live_sessions = list(live_result.scalars().all())

        request_result = await db.execute(
            select(ProfessorChangeRequest)
            .where(
                ProfessorChangeRequest.course_offering_id.in_(offering_ids),
                ProfessorChangeRequest.status == "pending",
            )
            .order_by(ProfessorChangeRequest.created_at.desc())
            .limit(5)
        )
        change_requests = list(request_result.scalars().all())

        chat_unread_count = int(await db.scalar(
            select(func.sum(ProfessorChatConversation.unread_for_professor))
            .where(ProfessorChatConversation.professor_user_id == professor.id)
        ) or 0)
        chat_pinned_count = int(await db.scalar(
            select(func.count())
            .select_from(ProfessorChatConversation)
            .where(
                ProfessorChatConversation.professor_user_id == professor.id,
                ProfessorChatConversation.is_pinned_by_professor == True,  # noqa: E712
            )
        ) or 0)

    return ProfessorDashboardOut(
        offerings=[_offering_out(offering) for offering in offerings],
        active_offering=_offering_out(offerings[0]) if offerings else None,
        upcoming_live_sessions=[_professor_live_session_out(session) for session in live_sessions],
        pending_change_requests=[ProfessorChangeRequestOut.model_validate(request) for request in change_requests],
        chat_unread_count=chat_unread_count,
        chat_pinned_count=chat_pinned_count,
    )


@router.get("/offerings", response_model=list[CourseOfferingOut])
async def list_professor_offerings(
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    return [_offering_out(offering) for offering in await _professor_offerings(db, professor)]


@router.get("/live-provider-config", response_model=LiveProviderConfigOut)
async def get_live_provider_config(
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    del professor
    missing: list[str] = []
    if not settings.vdocipher_api_secret:
        missing.append("VDOCIPHER_API_SECRET")
    if not settings.vdocipher_live_create_url:
        missing.append("VDOCIPHER_LIVE_CREATE_URL")
    return LiveProviderConfigOut(
        has_api_secret=bool(settings.vdocipher_api_secret),
        can_auto_create=not missing,
        missing=missing,
        create_endpoint_configured=bool(settings.vdocipher_live_create_url),
    )


@router.get("/live-sessions", response_model=list[ProfessorLiveSessionOut])
async def list_live_sessions(
    course_offering_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    offerings = await _professor_offerings(db, professor)
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
    return [_professor_live_session_out(session) for session in result.scalars().all()]


@router.get("/live-sessions/{live_session_id}/embed", response_model=LiveSessionEmbedOut)
async def get_professor_live_embed(
    live_session_id: int,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    session = await _require_professor_live_session(db, professor, live_session_id)
    return LiveSessionEmbedOut(
        id=session.id,
        title=session.title,
        status=session.status,
        embed_url=get_live_embed_url(session.vdocipher_live_id),
        chat_embed_url="",
        vdocipher_live_id=session.vdocipher_live_id,
    )


@router.post("/live-sessions/{live_session_id}/stream-credentials/reveal", response_model=LiveSessionStreamCredentialsOut)
async def reveal_professor_live_stream_credentials(
    live_session_id: int,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    session = await _require_professor_live_session(db, professor, live_session_id)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    _record_professor_audit(
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


@router.post("/live-sessions", response_model=ProfessorLiveSessionOut, status_code=201)
async def create_live_session(
    body: LiveSessionIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    offering = await _require_professor_offering(db, professor, body.course_offering_id)
    if body.ends_at <= body.starts_at:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")
    await _enforce_professor_mutation_rate_limit(db, professor, request)

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
    _sync_calendar_event_from_live_session(event, session, offering, professor)
    db.add(event)
    await db.flush()
    event.preparation_href = f"/calendar?event={event.id}"
    session.calendar_event_id = event.id
    session.join_url = session.join_url or f"/live/{session.id}"
    _sync_calendar_event_from_live_session(event, session, offering, professor)

    notification_delivered = await _notify_students_for_live(
        db,
        session,
        offering,
        "live.session.created",
        "New live session scheduled",
        f"{session.title} was added to your calendar.",
    )
    session.notification_status = _notification_status_from_realtime(notification_delivered)
    _record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_create",
        model_name="LiveSession",
        object_pk=session.id,
        object_repr=session.title,
        changed_data={"course_offering_id": session.course_offering_id, "status": session.status},
    )
    await _enqueue_live_session_event_and_track(db, session, "live.session.created")
    await db.commit()
    await db.refresh(session)
    return _professor_live_session_out(session)


@router.delete("/live-sessions/{live_session_id}")
async def delete_live_session(
    live_session_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    session = await _require_professor_live_session(db, professor, live_session_id)
    if session.status == "live":
        raise HTTPException(status_code=409, detail="End the live session before deleting it")
    await _enforce_professor_mutation_rate_limit(db, professor, request)
    session_title = session.title
    if session.calendar_event:
        session.calendar_event.status = "cancelled"
    await db.delete(session)
    _record_professor_audit(
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


@router.patch("/live-sessions/{live_session_id}", response_model=ProfessorLiveSessionOut)
async def update_live_session(
    live_session_id: int,
    body: LiveSessionUpdateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    session = await _require_professor_live_session(db, professor, live_session_id)
    await _enforce_professor_mutation_rate_limit(db, professor, request)
    offering = session.course_offering
    if body.course_offering_id is not None and body.course_offering_id != session.course_offering_id:
        offering = await _require_professor_offering(db, professor, body.course_offering_id)
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
        _sync_calendar_event_from_live_session(session.calendar_event, session, offering, professor)
    notification_delivered = await _notify_students_for_live(
        db,
        session,
        offering,
        "live.session.updated",
        "Live session updated",
        f"{session.title} was updated in your calendar.",
    )
    session.notification_status = _notification_status_from_realtime(notification_delivered)
    _record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSession",
        object_pk=session.id,
        object_repr=session.title,
        changed_data=body.model_dump(exclude_unset=True, mode="json"),
    )
    await _enqueue_live_session_event_and_track(db, session, "live.session.updated")
    await db.commit()
    await db.refresh(session)
    return _professor_live_session_out(session)


@router.post("/live-sessions/{live_session_id}/cancel", response_model=ProfessorLiveSessionOut)
async def cancel_live_session(
    live_session_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    session = await _require_professor_live_session(db, professor, live_session_id)
    if session.status == "completed":
        raise HTTPException(status_code=409, detail="Completed sessions cannot be cancelled")
    await _enforce_professor_mutation_rate_limit(db, professor, request)
    session.status = "cancelled"
    if session.calendar_event:
        _sync_calendar_event_from_live_session(session.calendar_event, session, session.course_offering, professor)
    notification_delivered = await _notify_students_for_live(
        db,
        session,
        session.course_offering,
        "live.session.cancelled",
        "Live session cancelled",
        f"{session.title} was cancelled.",
    )
    session.notification_status = _notification_status_from_realtime(notification_delivered)
    _record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSession",
        object_pk=session.id,
        object_repr=session.title,
        changed_data={"status": "cancelled"},
    )
    await _enqueue_live_session_event_and_track(db, session, "live.session.cancelled")
    await db.commit()
    await db.refresh(session)
    return _professor_live_session_out(session)


@router.get("/student-live-sessions", response_model=list[LiveSessionViewerOut])
async def list_student_live_sessions(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    access_context = await build_access_context(db, user)
    result = await db.execute(
        select(LiveSession)
        .join(CourseOffering, CourseOffering.id == LiveSession.course_offering_id)
        .join(ProgramTrack, ProgramTrack.id == CourseOffering.track_id)
        .options(
            selectinload(LiveSession.course_offering).selectinload(CourseOffering.subject),
            selectinload(LiveSession.course_offering).selectinload(CourseOffering.track),
            selectinload(LiveSession.professor),
        )
        .where(
            LiveSession.status != "cancelled",
            ProgramTrack.niveau == user.niveau,
            ProgramTrack.filiere == user.filiere,
        )
        .order_by(LiveSession.starts_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return [
        _live_viewer_out(session)
        for session in result.scalars().all()
        if access_context.decide_for(
            LIVE_SESSION_ACCESS_REQUIREMENT,
            subject_id=session.course_offering.subject_id,
        ).can_access
    ]


@router.get("/student-live-sessions/{live_session_id}/embed", response_model=LiveSessionEmbedOut)
async def get_student_live_embed(
    live_session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = await _require_student_live_session(db, user, live_session_id)
    if not _live_session_is_joinable(session):
        raise HTTPException(status_code=409, detail="Live session is not joinable")
    return LiveSessionEmbedOut(
        id=session.id,
        title=session.title,
        status=session.status,
        embed_url=get_live_embed_url(session.vdocipher_live_id),
        chat_embed_url="",
        vdocipher_live_id=session.vdocipher_live_id,
    )


@router.get("/live-sessions/{live_session_id}/interactions", response_model=list[LiveSessionInteractionOut])
async def list_professor_live_interactions(
    live_session_id: int,
    status: str | None = None,
    kind: str | None = None,
    before_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    await _require_professor_live_session(db, professor, live_session_id)
    if status is not None and status not in ALLOWED_LIVE_INTERACTION_STATUSES:
        raise HTTPException(status_code=400, detail="Unsupported live interaction status")
    normalized_kind = _normalize_live_interaction_kind(kind) if kind is not None else None
    stmt = (
        select(LiveSessionInteraction)
        .options(selectinload(LiveSessionInteraction.student))
        .where(LiveSessionInteraction.live_session_id == live_session_id)
        .order_by(LiveSessionInteraction.created_at.desc(), LiveSessionInteraction.id.desc())
        .limit(limit)
    )
    if status is not None:
        stmt = stmt.where(LiveSessionInteraction.status == status)
    if normalized_kind is not None:
        stmt = stmt.where(LiveSessionInteraction.kind == normalized_kind)
    if before_id is not None:
        stmt = stmt.where(LiveSessionInteraction.id < before_id)
    result = await db.execute(stmt)
    return [_live_interaction_out(interaction) for interaction in result.scalars().all()]


@router.patch("/live-sessions/interactions/{interaction_id}", response_model=LiveSessionInteractionOut)
async def update_professor_live_interaction(
    interaction_id: int,
    body: LiveSessionInteractionPatchIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    interaction = await _require_professor_live_interaction(db, professor, interaction_id)
    await _enforce_professor_mutation_rate_limit(db, professor, request)
    now = datetime.now(timezone.utc)
    if body.status is not None:
        if body.status not in ALLOWED_LIVE_INTERACTION_STATUSES:
            raise HTTPException(status_code=400, detail="Unsupported live interaction status")
        interaction.status = body.status
        if body.status == "deleted":
            interaction.deleted_at = now
        elif body.status == "answered":
            interaction.deleted_at = None
            interaction.answered_by_user_id = professor.id
            interaction.answered_at = now
        elif body.status == "pending":
            interaction.deleted_at = None
            interaction.answered_by_user_id = None
            interaction.answered_at = None
        elif body.status != "deleted":
            interaction.deleted_at = None
    if body.answer is not None:
        interaction.answer = body.answer.strip()
        if interaction.answer:
            interaction.status = "answered"
            interaction.answered_by_user_id = professor.id
            interaction.answered_at = now
        else:
            interaction.answered_by_user_id = None
            interaction.answered_at = None
            if interaction.status == "answered":
                interaction.status = "pending"
    _record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSessionInteraction",
        object_pk=interaction.id,
        object_repr=interaction.body,
        changed_data=body.model_dump(exclude_unset=True, mode="json"),
    )
    await db.flush()
    interaction = await _require_professor_live_interaction(db, professor, interaction_id)
    payload = _live_interaction_out(interaction).model_dump(mode="json")
    await _enqueue_live_session_event(db, interaction.live_session_id, "live.interaction.updated", payload)
    await db.commit()
    interaction = await _require_professor_live_interaction(db, professor, interaction_id)
    return _live_interaction_out(interaction)


@router.delete("/live-sessions/interactions/{interaction_id}", response_model=LiveSessionInteractionOut)
async def delete_professor_live_interaction(
    interaction_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    interaction = await _require_professor_live_interaction(db, professor, interaction_id)
    await _enforce_professor_mutation_rate_limit(db, professor, request)
    interaction.status = "deleted"
    interaction.deleted_at = datetime.now(timezone.utc)
    _record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_delete",
        model_name="LiveSessionInteraction",
        object_pk=interaction.id,
        object_repr=interaction.body,
    )
    await db.flush()
    interaction = await _require_professor_live_interaction(db, professor, interaction_id)
    payload = _live_interaction_out(interaction).model_dump(mode="json")
    await _enqueue_live_session_event(db, interaction.live_session_id, "live.interaction.deleted", payload)
    await db.commit()
    interaction = await _require_professor_live_interaction(db, professor, interaction_id)
    return _live_interaction_out(interaction)


@router.get("/student-live-sessions/{live_session_id}/interactions", response_model=list[LiveSessionInteractionOut])
async def list_student_live_interactions(
    live_session_id: int,
    kind: str | None = None,
    before_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_student_live_session(db, user, live_session_id)
    normalized_kind = _normalize_live_interaction_kind(kind) if kind is not None else None
    stmt = (
        select(LiveSessionInteraction)
        .options(selectinload(LiveSessionInteraction.student))
        .where(
            LiveSessionInteraction.live_session_id == live_session_id,
            LiveSessionInteraction.status.not_in(["deleted", "hidden"]),
            or_(
                LiveSessionInteraction.kind == "message",
                LiveSessionInteraction.student_user_id == user.id,
                LiveSessionInteraction.status == "answered",
            ),
        )
        .order_by(LiveSessionInteraction.created_at.desc(), LiveSessionInteraction.id.desc())
        .limit(limit)
    )
    if normalized_kind is not None:
        stmt = stmt.where(LiveSessionInteraction.kind == normalized_kind)
    if before_id is not None:
        stmt = stmt.where(LiveSessionInteraction.id < before_id)
    result = await db.execute(stmt)
    return [_live_interaction_out(interaction) for interaction in result.scalars().all()]


@router.post("/student-live-sessions/{live_session_id}/interactions", response_model=LiveSessionInteractionOut, status_code=201)
async def create_student_live_interaction(
    live_session_id: int,
    body: LiveSessionInteractionIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    session = await _require_student_live_session(db, user, live_session_id)
    if not _live_session_is_joinable(session):
        raise HTTPException(status_code=409, detail="Live session is not accepting messages")
    kind = _normalize_live_interaction_kind(body.kind)
    clean_body = _clean_live_interaction_body(body.body)
    await _enforce_live_interaction_burst_limit(db, session.id, user)
    interaction = LiveSessionInteraction(
        live_session_id=session.id,
        course_offering_id=session.course_offering_id,
        professor_user_id=session.professor_user_id,
        student_user_id=user.id,
        kind=kind,
        body=clean_body,
    )
    db.add(interaction)
    await db.flush()
    interaction_id = interaction.id
    interaction = (await db.execute(
        select(LiveSessionInteraction)
        .options(selectinload(LiveSessionInteraction.student))
        .where(LiveSessionInteraction.id == interaction_id)
    )).scalar_one()
    payload = _live_interaction_out(interaction).model_dump(mode="json")
    await _enqueue_live_session_event(db, interaction.live_session_id, "live.interaction.created", payload)
    await db.commit()
    return _live_interaction_out(interaction)


@router.get("/live-sessions/{live_session_id}/checkpoints", response_model=list[LiveSessionCheckpointOut])
async def list_professor_live_checkpoints(
    live_session_id: int,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    await _require_professor_live_session(db, professor, live_session_id)
    result = await db.execute(
        select(LiveSessionCheckpoint)
        .where(LiveSessionCheckpoint.live_session_id == live_session_id)
        .order_by(LiveSessionCheckpoint.created_at.desc(), LiveSessionCheckpoint.id.desc())
        .limit(50)
    )
    return [LiveSessionCheckpointOut.model_validate(item) for item in result.scalars().all()]


@router.post("/live-sessions/{live_session_id}/checkpoints", response_model=LiveSessionCheckpointOut, status_code=201)
async def create_professor_live_checkpoint(
    live_session_id: int,
    body: LiveSessionCheckpointIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    session = await _require_professor_live_session(db, professor, live_session_id)
    await _enforce_professor_mutation_rate_limit(db, professor, request)
    checkpoint_type = body.checkpoint_type.strip().casefold()
    if checkpoint_type not in ALLOWED_LIVE_CHECKPOINT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported live checkpoint type")
    checkpoint = LiveSessionCheckpoint(
        live_session_id=session.id,
        course_offering_id=session.course_offering_id,
        professor_user_id=professor.id,
        title=body.title.strip(),
        prompt=body.prompt.strip(),
        checkpoint_type=checkpoint_type,
    )
    db.add(checkpoint)
    await db.flush()
    _record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_create",
        model_name="LiveSessionCheckpoint",
        object_pk=checkpoint.id,
        object_repr=checkpoint.title,
        changed_data={"live_session_id": checkpoint.live_session_id, "checkpoint_type": checkpoint.checkpoint_type},
    )
    await db.flush()
    payload = LiveSessionCheckpointOut.model_validate(checkpoint).model_dump(mode="json")
    await _enqueue_live_session_event(db, checkpoint.live_session_id, "live.checkpoint.created", payload)
    await db.commit()
    await db.refresh(checkpoint)
    return LiveSessionCheckpointOut.model_validate(checkpoint)


@router.patch("/live-sessions/checkpoints/{checkpoint_id}", response_model=LiveSessionCheckpointOut)
async def update_professor_live_checkpoint(
    checkpoint_id: int,
    body: LiveSessionCheckpointPatchIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    checkpoint = await _require_professor_live_checkpoint(db, professor, checkpoint_id)
    await _enforce_professor_mutation_rate_limit(db, professor, request)
    if body.status is not None:
        if body.status not in ALLOWED_LIVE_CHECKPOINT_STATUSES:
            raise HTTPException(status_code=400, detail="Unsupported live checkpoint status")
        checkpoint.status = body.status
        checkpoint.closed_at = datetime.now(timezone.utc) if body.status in {"closed", "deleted"} else None
    _record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSessionCheckpoint",
        object_pk=checkpoint.id,
        object_repr=checkpoint.title,
        changed_data=body.model_dump(exclude_unset=True, mode="json"),
    )
    await db.flush()
    payload = LiveSessionCheckpointOut.model_validate(checkpoint).model_dump(mode="json")
    await _enqueue_live_session_event(db, checkpoint.live_session_id, "live.checkpoint.updated", payload)
    await db.commit()
    await db.refresh(checkpoint)
    return LiveSessionCheckpointOut.model_validate(checkpoint)


@router.get("/student-live-sessions/{live_session_id}/checkpoints", response_model=list[LiveSessionCheckpointOut])
async def list_student_live_checkpoints(
    live_session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_student_live_session(db, user, live_session_id)
    result = await db.execute(
        select(LiveSessionCheckpoint)
        .where(
            LiveSessionCheckpoint.live_session_id == live_session_id,
            LiveSessionCheckpoint.status != "deleted",
        )
        .order_by(LiveSessionCheckpoint.created_at.desc(), LiveSessionCheckpoint.id.desc())
        .limit(20)
    )
    return [LiveSessionCheckpointOut.model_validate(item) for item in result.scalars().all()]


@router.post("/live-sessions/{live_session_id}/notify", response_model=ProfessorLiveSessionOut)
async def notify_live_session(
    live_session_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    session = await _require_professor_live_session(db, professor, live_session_id)
    await _enforce_professor_mutation_rate_limit(db, professor, request)
    notification_delivered = await _notify_students_for_live(
        db,
        session,
        session.course_offering,
        "live.session.notify",
        "Upcoming live session",
        f"{session.title} is scheduled for {session.starts_at:%Y-%m-%d %H:%M}.",
    )
    session.notification_status = _notification_status_from_realtime(notification_delivered)
    _record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSession",
        object_pk=session.id,
        object_repr=session.title,
        changed_data={"notification_status": session.notification_status},
    )
    await _enqueue_live_session_event_and_track(db, session, "live.session.notified")
    await db.commit()
    await db.refresh(session)
    return _professor_live_session_out(session)


@router.post("/live-sessions/{live_session_id}/start", response_model=ProfessorLiveSessionOut)
async def start_live_session(
    live_session_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    session = await _require_professor_live_session(db, professor, live_session_id)
    await _enforce_professor_mutation_rate_limit(db, professor, request)
    session.status = "live"
    if session.calendar_event:
        _sync_calendar_event_from_live_session(session.calendar_event, session, session.course_offering, professor)
    notification_delivered = await _notify_students_for_live(
        db,
        session,
        session.course_offering,
        "live.session.started",
        "Live session started",
        f"{session.title} is live now.",
    )
    session.notification_status = _notification_status_from_realtime(notification_delivered)
    _record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSession",
        object_pk=session.id,
        object_repr=session.title,
        changed_data={"status": "live"},
    )
    await _enqueue_live_session_event_and_track(db, session, "live.session.started")
    await db.commit()
    await db.refresh(session)
    return _professor_live_session_out(session)


@router.post("/live-sessions/{live_session_id}/end", response_model=ProfessorLiveSessionOut)
async def end_live_session(
    live_session_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    session = await _require_professor_live_session(db, professor, live_session_id)
    await _enforce_professor_mutation_rate_limit(db, professor, request)
    session.status = "completed"
    if session.calendar_event:
        _sync_calendar_event_from_live_session(session.calendar_event, session, session.course_offering, professor)
    notification_delivered = await _notify_students_for_live(
        db,
        session,
        session.course_offering,
        "live.session.completed",
        "Live session ended",
        f"{session.title} has ended.",
    )
    session.notification_status = _notification_status_from_realtime(notification_delivered)
    _record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSession",
        object_pk=session.id,
        object_repr=session.title,
        changed_data={"status": "completed"},
    )
    await _enqueue_live_session_event_and_track(db, session, "live.session.completed")
    await db.commit()
    await db.refresh(session)
    return _professor_live_session_out(session)


@router.get("/change-requests", response_model=list[ProfessorChangeRequestOut])
async def list_change_requests(
    status: str = "pending",
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    offerings = await _professor_offerings(db, professor)
    allowed_ids = [offering.id for offering in offerings]
    if not allowed_ids:
        return []
    stmt = (
        select(ProfessorChangeRequest)
        .where(ProfessorChangeRequest.course_offering_id.in_(allowed_ids))
        .order_by(ProfessorChangeRequest.created_at.desc())
    )
    if status:
        stmt = stmt.where(ProfessorChangeRequest.status == status)
    result = await db.execute(stmt)
    return [ProfessorChangeRequestOut.model_validate(item) for item in result.scalars().all()]


@router.post("/change-requests", response_model=ProfessorChangeRequestOut, status_code=201)
async def create_change_request(
    body: ProfessorChangeRequestIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
):
    await _require_professor_offering(db, professor, body.course_offering_id)
    await _enforce_professor_mutation_rate_limit(db, professor, request)
    if body.target_type not in ALLOWED_CHANGE_TARGETS:
        raise HTTPException(status_code=400, detail="Unsupported change request target")
    if not await _target_belongs_to_offering(db, body.course_offering_id, body.target_type, body.target_id):
        raise HTTPException(status_code=403, detail="Target does not belong to this course offering")
    change_request = ProfessorChangeRequest(
        course_offering_id=body.course_offering_id,
        professor_user_id=professor.id,
        target_type=body.target_type,
        target_id=body.target_id,
        change_type=body.change_type,
        proposed_patch_json=body.proposed_patch_json,
        current_snapshot_json=body.current_snapshot_json,
    )
    db.add(change_request)
    await db.flush()
    _record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_create",
        model_name="ProfessorChangeRequest",
        object_pk=change_request.id,
        object_repr=f"{change_request.target_type}:{change_request.target_id}",
        changed_data={
            "course_offering_id": change_request.course_offering_id,
            "target_type": change_request.target_type,
            "target_id": change_request.target_id,
            "change_type": change_request.change_type,
        },
    )
    await db.commit()
    await db.refresh(change_request)
    return ProfessorChangeRequestOut.model_validate(change_request)


@router.get("/chat/conversations", response_model=list[ProfessorChatConversationOut])
async def list_professor_conversations(
    q: str = "",
    unread: bool = False,
    pinned: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    stmt = (
        select(ProfessorChatConversation)
        .options(
            selectinload(ProfessorChatConversation.course_offering).selectinload(CourseOffering.subject),
            selectinload(ProfessorChatConversation.course_offering).selectinload(CourseOffering.track),
            selectinload(ProfessorChatConversation.professor),
            selectinload(ProfessorChatConversation.student),
        )
        .where(ProfessorChatConversation.professor_user_id == professor.id)
    )
    if unread:
        stmt = stmt.where(ProfessorChatConversation.unread_for_professor > 0)
    if pinned:
        stmt = stmt.where(ProfessorChatConversation.is_pinned_by_professor == True)  # noqa: E712
    if q:
        needle = f"%{q}%"
        stmt = stmt.join(User, User.id == ProfessorChatConversation.student_user_id).where(
            or_(
                User.full_name.ilike(needle),
                User.email.ilike(needle),
                ProfessorChatConversation.last_message_preview.ilike(needle),
            )
        )
    stmt = stmt.order_by(
        ProfessorChatConversation.is_pinned_by_professor.desc(),
        ProfessorChatConversation.last_message_at.desc(),
    ).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return [_conversation_out(conversation, settings) for conversation in result.scalars().all()]


@router.get("/chat/conversations/{conversation_id}/messages", response_model=list[ProfessorChatMessageOut])
async def list_professor_messages(
    conversation_id: int,
    before_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    conversation = await _require_professor_conversation(db, professor, conversation_id, for_update=True)
    conversation.unread_for_professor = 0
    await db.commit()
    return await _messages_for_conversation(db, conversation_id, settings, limit=limit, before_id=before_id)


@router.post("/chat/conversations/{conversation_id}/messages", response_model=ProfessorChatMessageOut, status_code=201)
async def send_professor_message(
    conversation_id: int,
    body: ChatMessageIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    conversation = await _require_professor_conversation(db, professor, conversation_id, for_update=True)
    await _enforce_professor_mutation_rate_limit(db, professor, request)
    message = ProfessorChatMessage(conversation_id=conversation.id, sender_user_id=professor.id, body=body.body)
    db.add(message)
    await _apply_professor_sent_message_update(db, conversation, body.body)
    await db.flush()
    _record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_create",
        model_name="ProfessorChatMessage",
        object_pk=message.id,
        object_repr=conversation.last_message_preview,
        changed_data={"conversation_id": conversation.id},
    )
    await enqueue_realtime_event(
        db,
        channel=f"kresco:user:{conversation.student_user_id}:notifications",
        event_name="professor.chat.message",
        payload={"conversation_id": conversation.id, "message_id": message.id, "preview": conversation.last_message_preview},
    )
    await db.commit()
    await db.refresh(message)
    return _message_out(message, professor.role, settings)


@router.post("/chat/conversations/{conversation_id}/images", response_model=ProfessorChatMessageOut, status_code=201)
async def send_professor_image_message(
    conversation_id: int,
    request: Request,
    body: str = Form(default=""),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    conversation = await _require_professor_conversation(db, professor, conversation_id, for_update=True)
    await _enforce_professor_mutation_rate_limit(db, professor, request)
    attachment_url, attachment_mime_type, attachment_name, attachment_size = await _save_chat_image(db, settings, conversation.id, file)
    clean_body = body.strip()[:1000]
    message = ProfessorChatMessage(
        conversation_id=conversation.id,
        sender_user_id=professor.id,
        body=clean_body,
        attachment_url=attachment_url,
        attachment_mime_type=attachment_mime_type,
        attachment_name=attachment_name,
        attachment_size=attachment_size,
    )
    db.add(message)
    await _apply_professor_sent_message_update(db, conversation, clean_body or "Image")
    await db.flush()
    _record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_create",
        model_name="ProfessorChatMessage",
        object_pk=message.id,
        object_repr=conversation.last_message_preview,
        changed_data={"conversation_id": conversation.id, "attachment_mime_type": attachment_mime_type},
    )
    await enqueue_realtime_event(
        db,
        channel=f"kresco:user:{conversation.student_user_id}:notifications",
        event_name="professor.chat.message",
        payload={"conversation_id": conversation.id, "message_id": message.id, "preview": conversation.last_message_preview},
    )
    await db.commit()
    await db.refresh(message)
    return _message_out(message, professor.role, settings)


@router.patch("/chat/messages/{message_id}", response_model=ProfessorChatMessageOut)
async def update_chat_message(
    message_id: int,
    body: ChatMessagePatchIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    message, conversation = await _require_owned_chat_message(db, user, message_id)
    if user.role == "professor":
        await require_professor_active_offering(db, user)
        await _enforce_professor_mutation_rate_limit(db, user, request)
    if datetime.now(timezone.utc) - _chat_datetime(message.created_at) > CHAT_MESSAGE_EDIT_WINDOW:
        raise HTTPException(status_code=403, detail="Messages can only be edited for 15 minutes")

    clean_body = body.body.strip()
    if not clean_body:
        raise HTTPException(status_code=422, detail="Message body is required")

    message.body = clean_body
    await _refresh_chat_preview(db, conversation)
    if user.role == "professor":
        _record_professor_audit(
            db,
            professor=user,
            request=request,
            action="professor_update",
            model_name="ProfessorChatMessage",
            object_pk=message.id,
            object_repr=conversation.last_message_preview,
            changed_data={"conversation_id": conversation.id},
        )
    await publish_chat_message_change(db, conversation, user, "professor.chat.message.updated", message.id)
    await db.commit()
    await db.refresh(message)
    return _message_out(message, user.role, settings)


@router.delete("/chat/messages/{message_id}")
async def delete_chat_message(
    message_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    message, conversation = await _require_owned_chat_message(db, user, message_id)
    if user.role == "professor":
        await require_professor_active_offering(db, user)
        await _enforce_professor_mutation_rate_limit(db, user, request)
    await db.delete(message)
    await db.flush()
    await _refresh_chat_preview(db, conversation)
    if user.role == "professor":
        _record_professor_audit(
            db,
            professor=user,
            request=request,
            action="professor_delete",
            model_name="ProfessorChatMessage",
            object_pk=message_id,
            object_repr=conversation.last_message_preview,
            changed_data={"conversation_id": conversation.id},
        )
    await publish_chat_message_change(db, conversation, user, "professor.chat.message.deleted", message_id)
    await db.commit()
    return {"ok": True}


@router.patch("/chat/conversations/{conversation_id}", response_model=ProfessorChatConversationOut)
async def patch_professor_conversation(
    conversation_id: int,
    body: ChatConversationPatchIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    professor: User = Depends(get_current_professor_user),
    settings: Settings = Depends(get_settings),
):
    conversation = await _require_professor_conversation(db, professor, conversation_id, for_update=True)
    await _enforce_professor_mutation_rate_limit(db, professor, request)
    if body.is_pinned_by_professor is not None:
        conversation.is_pinned_by_professor = body.is_pinned_by_professor
    if body.mark_read:
        conversation.unread_for_professor = 0
    _record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="ProfessorChatConversation",
        object_pk=conversation.id,
        object_repr=conversation.last_message_preview,
        changed_data=body.model_dump(exclude_unset=True, mode="json"),
    )
    await db.commit()
    await db.refresh(conversation)
    return _conversation_out(conversation, settings)


@router.get("/student-chat", response_model=StudentProfessorChatStatusOut)
async def get_student_professor_chat(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    eligibility = professor_chat_eligibility(user)
    offerings = await _student_offerings(db, user) if eligibility.eligible else []
    result = await db.execute(
        select(ProfessorChatConversation)
        .options(
            selectinload(ProfessorChatConversation.course_offering).selectinload(CourseOffering.subject),
            selectinload(ProfessorChatConversation.course_offering).selectinload(CourseOffering.track),
            selectinload(ProfessorChatConversation.professor),
            selectinload(ProfessorChatConversation.student),
        )
        .where(ProfessorChatConversation.student_user_id == user.id)
        .order_by(ProfessorChatConversation.last_message_at.desc())
    )
    conversations = list(result.scalars().all()) if eligibility.eligible else []
    teacher_threads = await _student_teacher_threads(db, offerings, conversations, settings) if eligibility.eligible else []
    return StudentProfessorChatStatusOut(
        eligible=eligibility.eligible,
        reason=eligibility.reason,
        offerings=[_offering_out(offering) for offering in offerings],
        conversations=[_conversation_out(conversation, settings) for conversation in conversations],
        teacher_threads=teacher_threads,
    )


@router.post("/student-chat/conversations", response_model=ProfessorChatConversationOut, status_code=201)
async def start_student_conversation(
    body: StudentStartConversationIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    _ensure_student_professor_chat_access(user)
    result = await db.execute(
        select(CourseOffering)
        .options(selectinload(CourseOffering.subject), selectinload(CourseOffering.track), selectinload(CourseOffering.professor))
        .where(CourseOffering.id == body.course_offering_id, CourseOffering.status == "active")
    )
    offering = result.scalar_one_or_none()
    if offering is None:
        raise HTTPException(status_code=404, detail="Course offering not found")
    _ensure_student_matches_offering(user, offering)

    existing = await db.scalar(
        select(ProfessorChatConversation).where(
            ProfessorChatConversation.course_offering_id == offering.id,
            ProfessorChatConversation.student_user_id == user.id,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="Conversation already exists")

    conversation = ProfessorChatConversation(
        course_offering_id=offering.id,
        professor_user_id=offering.professor_user_id,
        student_user_id=user.id,
        unread_for_professor=1,
        last_message_preview=body.body.strip().replace("\n", " ")[:255],
        last_message_at=datetime.now(timezone.utc),
    )
    db.add(conversation)
    await db.flush()
    db.add(ProfessorChatMessage(conversation_id=conversation.id, sender_user_id=user.id, body=body.body))
    await enqueue_realtime_event(
        db,
        channel=f"kresco:professor:{conversation.professor_user_id}:inbox",
        event_name="professor.chat.started",
        payload={"conversation_id": conversation.id, "student_user_id": user.id, "preview": conversation.last_message_preview},
    )
    await db.commit()
    result = await db.execute(
        select(ProfessorChatConversation)
        .options(
            selectinload(ProfessorChatConversation.course_offering).selectinload(CourseOffering.subject),
            selectinload(ProfessorChatConversation.course_offering).selectinload(CourseOffering.track),
            selectinload(ProfessorChatConversation.professor),
            selectinload(ProfessorChatConversation.student),
        )
        .where(ProfessorChatConversation.id == conversation.id)
    )
    conversation_out = result.scalar_one()
    return _conversation_out(conversation_out, settings)


@router.get("/student-chat/conversations/{conversation_id}/messages", response_model=list[ProfessorChatMessageOut])
async def list_student_messages(
    conversation_id: int,
    before_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    _ensure_student_professor_chat_access(user)
    conversation = await _require_student_conversation(db, user, conversation_id, for_update=True)
    conversation.unread_for_student = 0
    await db.commit()
    return await _messages_for_conversation(db, conversation_id, settings, limit=limit, before_id=before_id)


@router.post("/student-chat/conversations/{conversation_id}/messages", response_model=ProfessorChatMessageOut, status_code=201)
async def send_student_message(
    conversation_id: int,
    body: ChatMessageIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    _ensure_student_professor_chat_access(user)
    conversation = await _require_student_conversation(db, user, conversation_id, for_update=True)
    message = ProfessorChatMessage(conversation_id=conversation.id, sender_user_id=user.id, body=body.body)
    db.add(message)
    await _apply_student_sent_message_update(db, conversation, body.body)
    await db.flush()
    await enqueue_realtime_event(
        db,
        channel=f"kresco:professor:{conversation.professor_user_id}:inbox",
        event_name="professor.chat.message",
        payload={"conversation_id": conversation.id, "message_id": message.id, "student_user_id": user.id, "preview": conversation.last_message_preview},
    )
    await db.commit()
    await db.refresh(message)
    return _message_out(message, user.role, settings)


@router.post("/student-chat/conversations/{conversation_id}/images", response_model=ProfessorChatMessageOut, status_code=201)
async def send_student_image_message(
    conversation_id: int,
    body: str = Form(default=""),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    _ensure_student_professor_chat_access(user)
    conversation = await _require_student_conversation(db, user, conversation_id, for_update=True)
    attachment_url, attachment_mime_type, attachment_name, attachment_size = await _save_chat_image(db, settings, conversation.id, file)
    clean_body = body.strip()[:1000]
    message = ProfessorChatMessage(
        conversation_id=conversation.id,
        sender_user_id=user.id,
        body=clean_body,
        attachment_url=attachment_url,
        attachment_mime_type=attachment_mime_type,
        attachment_name=attachment_name,
        attachment_size=attachment_size,
    )
    db.add(message)
    await _apply_student_sent_message_update(db, conversation, clean_body or "Image")
    await db.flush()
    await enqueue_realtime_event(
        db,
        channel=f"kresco:professor:{conversation.professor_user_id}:inbox",
        event_name="professor.chat.message",
        payload={"conversation_id": conversation.id, "message_id": message.id, "student_user_id": user.id, "preview": conversation.last_message_preview},
    )
    await db.commit()
    await db.refresh(message)
    return _message_out(message, user.role, settings)
