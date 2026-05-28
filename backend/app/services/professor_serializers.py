from datetime import datetime, timezone

from app.config import Settings
from app.models.professor import CourseOffering, LiveSession, LiveSessionInteraction, ProfessorChatConversation, ProfessorChatMessage
from app.models.users import User
from app.schemas.professor import (
    ChatParticipantOut,
    CourseOfferingOut,
    LiveSessionInteractionOut,
    LiveSessionViewerOut,
    ProfessorChatConversationOut,
    ProfessorChatMessageOut,
    ProfessorLiveSessionOut,
    ProgramTrackOut,
)
from app.services.media_storage import media_url


def live_session_is_joinable(session: LiveSession, now: datetime | None = None) -> bool:
    if not session.vdocipher_live_id or session.status != "live":
        return False
    current_time = now or datetime.now(timezone.utc)
    ends_at = session.ends_at
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)
    return ends_at >= current_time


def participant_out(user: User, settings: Settings) -> ChatParticipantOut:
    return ChatParticipantOut(
        id=user.id,
        full_name=user.full_name,
        avatar_url=media_url(user.avatar_url, settings),
        tier=getattr(user, "tier", "basic") or "basic",
    )


def offering_out(offering: CourseOffering) -> CourseOfferingOut:
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


def live_viewer_out(session: LiveSession) -> LiveSessionViewerOut:
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
        can_join=live_session_is_joinable(session),
    )


def professor_live_session_out(session: LiveSession) -> ProfessorLiveSessionOut:
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


def live_interaction_out(interaction: LiveSessionInteraction) -> LiveSessionInteractionOut:
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


def live_session_realtime_payload(session: LiveSession) -> dict:
    return {
        "live_session_id": session.id,
        "title": session.title,
        "status": session.status,
        "starts_at": session.starts_at.isoformat(),
        "ends_at": session.ends_at.isoformat(),
    }


def conversation_out(conversation: ProfessorChatConversation, settings: Settings) -> ProfessorChatConversationOut:
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
        professor=participant_out(conversation.professor, settings),
        student=participant_out(conversation.student, settings),
        status=conversation.status,
        last_message_preview=conversation.last_message_preview,
        unread_for_professor=conversation.unread_for_professor,
        unread_for_student=conversation.unread_for_student,
        is_pinned_by_professor=conversation.is_pinned_by_professor,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        last_message_at=conversation.last_message_at,
    )


def chat_datetime(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def message_out(message: ProfessorChatMessage, sender_role: str, settings: Settings) -> ProfessorChatMessageOut:
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


def notification_status_from_realtime(delivered: bool) -> str:
    return "sent" if delivered else "realtime_failed"
