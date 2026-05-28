from sqlalchemy import func, or_, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import noload, selectinload
from fastapi import HTTPException

from app.config import Settings
from app.models.courses import Subject
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
    LiveSessionViewerOut,
    ProfessorChangeRequestOut,
    ProfessorChatConversationOut,
    ProfessorDashboardOut,
    ProfessorChatMessageOut,
    StudentProfessorChatStatusOut,
    StudentProfessorThreadOut,
)
from app.services.access import FeatureAccessRequirement, build_access_context
from app.services.professor_chat_access import (
    professor_chat_eligibility,
    professor_chat_offering_mismatch_reason,
)
from app.services.professor_serializers import (
    chat_datetime,
    conversation_out,
    live_viewer_out,
    message_out,
    offering_out,
    participant_out,
    professor_live_session_out,
)
from app.services.professor_status import LiveSessionStatus

LIVE_SESSION_ACCESS_REQUIREMENT = FeatureAccessRequirement("live_sessions")
CONVERSATION_LOCKED_DETAIL = "Conversation is busy; retry shortly"
MAX_PROFESSOR_CONVERSATIONS_LIMIT = 100
MAX_CHAT_MESSAGES_LIMIT = 200


def is_lock_unavailable_error(exc: DBAPIError) -> bool:
    original = getattr(exc, "orig", None)
    code = getattr(original, "pgcode", None) or getattr(original, "sqlstate", None)
    if code == "55P03":
        return True
    return "could not obtain lock" in str(original or exc).lower()


async def conversation_last_sender_role(db: AsyncSession, conversation_ids: list[int]) -> dict[int, str]:
    if not conversation_ids:
        return {}

    latest_messages = (
        select(
            ProfessorChatMessage.conversation_id.label("conversation_id"),
            User.role.label("sender_role"),
            func.row_number()
            .over(
                partition_by=ProfessorChatMessage.conversation_id,
                order_by=(ProfessorChatMessage.created_at.desc(), ProfessorChatMessage.id.desc()),
            )
            .label("rank"),
        )
        .join(User, User.id == ProfessorChatMessage.sender_user_id)
        .where(ProfessorChatMessage.conversation_id.in_(conversation_ids))
        .subquery()
    )
    result = await db.execute(
        select(latest_messages.c.conversation_id, latest_messages.c.sender_role)
        .where(latest_messages.c.rank == 1)
    )
    return {conv_id: role for conv_id, role in result.all()}


async def student_teacher_threads(
    db: AsyncSession,
    offerings: list[CourseOffering],
    conversations: list[ProfessorChatConversation],
    settings: Settings,
) -> list[StudentProfessorThreadOut]:
    conversations_by_offering = {conversation.course_offering_id: conversation for conversation in conversations}
    last_sender_roles = await conversation_last_sender_role(db, [conversation.id for conversation in conversations])
    threads: list[StudentProfessorThreadOut] = []

    for offering in offerings:
        conversation = conversations_by_offering.get(offering.id)
        track = offering.track
        conversation_model = conversation_out(conversation, settings) if conversation else None
        threads.append(
            StudentProfessorThreadOut(
                course_offering_id=offering.id,
                offering_title=offering.title,
                subject_title=offering.subject.title if offering.subject else "",
                niveau=track.niveau if track else "",
                filiere=track.filiere if track else "",
                professor=participant_out(offering.professor, settings),
                conversation=conversation_model,
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
            -(chat_datetime(thread.last_message_at).timestamp() if thread.last_message_at else 0),
            thread.professor.full_name.casefold(),
            thread.subject_title.casefold(),
        ),
    )


async def professor_offerings(
    db: AsyncSession,
    professor: User,
    *,
    limit: int | None = None,
    offset: int = 0,
) -> list[CourseOffering]:
    stmt = (
        select(CourseOffering)
        .options(
            selectinload(CourseOffering.subject).options(noload(Subject.chapters)),
            selectinload(CourseOffering.track),
        )
        .where(CourseOffering.professor_user_id == professor.id, CourseOffering.status == "active")
        .order_by(CourseOffering.id)
    )
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def professor_dashboard(db: AsyncSession, professor: User) -> ProfessorDashboardOut:
    offerings = await professor_offerings(db, professor)
    offering_ids = [offering.id for offering in offerings]
    live_sessions: list[LiveSession] = []
    change_requests: list[ProfessorChangeRequest] = []
    chat_unread_count = 0
    chat_pinned_count = 0

    if offering_ids:
        live_result = await db.execute(
            select(LiveSession)
            .where(
                LiveSession.course_offering_id.in_(offering_ids),
                LiveSession.status.in_([LiveSessionStatus.SCHEDULED.value, LiveSessionStatus.LIVE.value]),
            )
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
        offerings=[offering_out(offering) for offering in offerings],
        active_offering=offering_out(offerings[0]) if offerings else None,
        upcoming_live_sessions=[professor_live_session_out(session) for session in live_sessions],
        pending_change_requests=[ProfessorChangeRequestOut.model_validate(request) for request in change_requests],
        chat_unread_count=chat_unread_count,
        chat_pinned_count=chat_pinned_count,
    )


async def require_professor_offering(db: AsyncSession, professor: User, offering_id: int) -> CourseOffering:
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


async def require_professor_live_session(
    db: AsyncSession,
    professor: User,
    live_session_id: int,
    *,
    for_update: bool = False,
) -> LiveSession:
    stmt = (
        select(LiveSession)
        .options(
            selectinload(LiveSession.calendar_event),
            selectinload(LiveSession.course_offering).selectinload(CourseOffering.subject),
            selectinload(LiveSession.course_offering).selectinload(CourseOffering.track),
        )
        .where(LiveSession.id == live_session_id, LiveSession.professor_user_id == professor.id)
    )
    if for_update:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    live_session = result.scalar_one_or_none()
    if live_session is None:
        raise HTTPException(status_code=404, detail="Live session not found")
    return live_session


async def student_offerings(
    db: AsyncSession,
    student: User,
    *,
    limit: int | None = None,
    offset: int = 0,
) -> list[CourseOffering]:
    stmt = (
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
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def student_live_sessions(
    db: AsyncSession,
    student: User,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[LiveSessionViewerOut]:
    access_context = await build_access_context(db, student)
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
            LiveSession.status != LiveSessionStatus.CANCELLED.value,
            CourseOffering.status == "active",
            ProgramTrack.niveau == student.niveau,
            ProgramTrack.filiere == student.filiere,
        )
        .order_by(LiveSession.starts_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return [
        live_viewer_out(session)
        for session in result.scalars().all()
        if access_context.decide_for(
            LIVE_SESSION_ACCESS_REQUIREMENT,
            subject_id=session.course_offering.subject_id,
        ).can_access
    ]


async def student_professor_chat_status(
    db: AsyncSession,
    student: User,
    settings: Settings,
    *,
    limit: int = 50,
    offset: int = 0,
) -> StudentProfessorChatStatusOut:
    eligibility = professor_chat_eligibility(student)
    offerings = await student_offerings(db, student, limit=limit, offset=offset) if eligibility.eligible else []
    conversations: list[ProfessorChatConversation] = []
    if eligibility.eligible:
        result = await db.execute(
            select(ProfessorChatConversation)
            .options(
                selectinload(ProfessorChatConversation.course_offering).selectinload(CourseOffering.subject),
                selectinload(ProfessorChatConversation.course_offering).selectinload(CourseOffering.track),
                selectinload(ProfessorChatConversation.professor),
                selectinload(ProfessorChatConversation.student),
            )
            .where(ProfessorChatConversation.student_user_id == student.id)
            .order_by(ProfessorChatConversation.last_message_at.desc())
            .offset(offset)
            .limit(limit)
        )
        conversations = list(result.scalars().all())
    teacher_threads = await student_teacher_threads(db, offerings, conversations, settings) if eligibility.eligible else []
    return StudentProfessorChatStatusOut(
        eligible=eligibility.eligible,
        reason=eligibility.reason,
        offerings=[offering_out(offering) for offering in offerings],
        conversations=[conversation_out(conversation, settings) for conversation in conversations],
        teacher_threads=teacher_threads,
    )


def ensure_student_professor_chat_access(user: User) -> None:
    eligibility = professor_chat_eligibility(user)
    if not eligibility.eligible:
        raise HTTPException(status_code=403, detail=eligibility.reason)


def ensure_student_matches_offering(student: User, offering: CourseOffering) -> None:
    reason = professor_chat_offering_mismatch_reason(student, offering)
    if reason:
        raise HTTPException(status_code=403, detail=reason)


async def require_professor_conversation(
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
        stmt = stmt.with_for_update(nowait=True)
    try:
        result = await db.execute(stmt)
    except DBAPIError as exc:
        if for_update and is_lock_unavailable_error(exc):
            raise HTTPException(status_code=409, detail=CONVERSATION_LOCKED_DETAIL) from exc
        raise
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


async def professor_conversations(
    db: AsyncSession,
    professor: User,
    settings: Settings,
    *,
    q: str = "",
    unread: bool = False,
    pinned: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[ProfessorChatConversationOut]:
    limit = min(max(limit, 1), MAX_PROFESSOR_CONVERSATIONS_LIMIT)
    offset = max(offset, 0)
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
    return [conversation_out(conversation, settings) for conversation in result.scalars().all()]


async def require_student_conversation(
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
        stmt = stmt.with_for_update(nowait=True)
    try:
        result = await db.execute(stmt)
    except DBAPIError as exc:
        if for_update and is_lock_unavailable_error(exc):
            raise HTTPException(status_code=409, detail=CONVERSATION_LOCKED_DETAIL) from exc
        raise
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


async def require_student_live_session(db: AsyncSession, student: User, live_session_id: int) -> LiveSession:
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
            LiveSession.status != LiveSessionStatus.CANCELLED.value,
            CourseOffering.status == "active",
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


async def require_professor_live_interaction(db: AsyncSession, professor: User, interaction_id: int) -> LiveSessionInteraction:
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


async def require_professor_live_checkpoint(db: AsyncSession, professor: User, checkpoint_id: int) -> LiveSessionCheckpoint:
    checkpoint = await db.scalar(
        select(LiveSessionCheckpoint).where(
            LiveSessionCheckpoint.id == checkpoint_id,
            LiveSessionCheckpoint.professor_user_id == professor.id,
        )
    )
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="Live checkpoint not found")
    return checkpoint


async def messages_for_conversation(
    db: AsyncSession,
    conversation_id: int,
    settings: Settings,
    *,
    limit: int = 100,
    before_id: int | None = None,
) -> list[ProfessorChatMessageOut]:
    limit = min(max(limit, 1), MAX_CHAT_MESSAGES_LIMIT)
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
        message_out(message, role, settings)
        for message, role in rows
    ]
