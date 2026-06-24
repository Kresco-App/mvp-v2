from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.professor import (
    CourseOffering,
    LiveSession,
    LiveSessionInteraction,
    ProfessorChatConversation,
    ProfessorChatMessage,
)
from app.models.reports import ContentReport
from app.models.users import User
from app.schemas.admin import (
    AdminChatConversationOut,
    AdminChatMessageOut,
    AdminCommunicationsOut,
    AdminCommunicationsSummaryOut,
    AdminLiveInteractionOut,
    AdminReportQueueItemOut,
)


def _int(value: Any) -> int:
    return int(value or 0)


def _str(value: Any) -> str:
    return str(value or "")


async def _count(db: AsyncSession, model: type[Any], *filters: Any) -> int:
    statement = select(func.count()).select_from(model)
    if filters:
        statement = statement.where(*filters)
    return _int(await db.scalar(statement))


async def _sum(db: AsyncSession, column: Any, *filters: Any) -> int:
    statement = select(func.coalesce(func.sum(column), 0))
    if filters:
        statement = statement.where(*filters)
    return _int(await db.scalar(statement))


async def _breakdown(db: AsyncSession, model: type[Any], column: Any) -> dict[str, int]:
    rows = await db.execute(
        select(column, func.count())
        .select_from(model)
        .group_by(column)
        .order_by(column)
    )
    return {str(key or "unset").lower(): _int(value) for key, value in rows.all()}


async def build_admin_communications(db: AsyncSession, *, limit: int = 50) -> AdminCommunicationsOut:
    now = datetime.now(timezone.utc)
    recent_since = now - timedelta(days=7)
    bounded_limit = max(1, min(int(limit or 50), 100))

    professor = aliased(User)
    student = aliased(User)
    reporter = aliased(User)
    assignee = aliased(User)

    summary = AdminCommunicationsSummaryOut(
        total_conversations=await _count(db, ProfessorChatConversation),
        open_conversations=await _count(db, ProfessorChatConversation, ProfessorChatConversation.status == "open"),
        unread_for_professors=await _sum(db, ProfessorChatConversation.unread_for_professor),
        unread_for_students=await _sum(db, ProfessorChatConversation.unread_for_student),
        messages_7d=await _count(db, ProfessorChatMessage, ProfessorChatMessage.created_at >= recent_since),
        live_sessions_live=await _count(db, LiveSession, LiveSession.status == "live"),
        pending_live_interactions=await _count(db, LiveSessionInteraction, LiveSessionInteraction.status == "pending"),
        open_reports=await _count(db, ContentReport, ContentReport.status.in_(("open", "in_review"))),
        urgent_open_reports=await _count(
            db,
            ContentReport,
            ContentReport.status.in_(("open", "in_review")),
            ContentReport.priority == "urgent",
        ),
    )

    conversations_result = await db.execute(
        select(
            ProfessorChatConversation.id.label("conversation_id"),
            ProfessorChatConversation.status,
            ProfessorChatConversation.course_offering_id,
            CourseOffering.title.label("course_title"),
            ProfessorChatConversation.professor_user_id,
            professor.full_name.label("professor_name"),
            ProfessorChatConversation.student_user_id,
            student.full_name.label("student_name"),
            ProfessorChatConversation.unread_for_professor,
            ProfessorChatConversation.unread_for_student,
            ProfessorChatConversation.last_message_preview,
            ProfessorChatConversation.last_message_at,
            ProfessorChatConversation.updated_at,
        )
        .select_from(ProfessorChatConversation)
        .outerjoin(CourseOffering, CourseOffering.id == ProfessorChatConversation.course_offering_id)
        .outerjoin(professor, professor.id == ProfessorChatConversation.professor_user_id)
        .outerjoin(student, student.id == ProfessorChatConversation.student_user_id)
        .order_by(
            ProfessorChatConversation.unread_for_professor.desc(),
            ProfessorChatConversation.unread_for_student.desc(),
            ProfessorChatConversation.last_message_at.desc(),
        )
        .limit(bounded_limit)
    )
    conversations = [
        AdminChatConversationOut(
            conversation_id=_int(row["conversation_id"]),
            status=_str(row["status"] or "open"),
            course_offering_id=_int(row["course_offering_id"]),
            course_title=_str(row["course_title"]),
            professor_user_id=_int(row["professor_user_id"]),
            professor_name=_str(row["professor_name"]),
            student_user_id=_int(row["student_user_id"]),
            student_name=_str(row["student_name"]),
            unread_for_professor=_int(row["unread_for_professor"]),
            unread_for_student=_int(row["unread_for_student"]),
            last_message_preview=_str(row["last_message_preview"]),
            last_message_at=row["last_message_at"],
            updated_at=row["updated_at"],
        )
        for row in conversations_result.mappings().all()
    ]
    if conversations:
        sender = aliased(User)
        conversation_ids = [conversation.conversation_id for conversation in conversations]
        sender_roles_by_conversation = {
            conversation.conversation_id: {
                conversation.professor_user_id: "professor",
                conversation.student_user_id: "student",
            }
            for conversation in conversations
        }
        ranked_messages = (
            select(
                ProfessorChatMessage.id.label("message_id"),
                ProfessorChatMessage.conversation_id,
                ProfessorChatMessage.sender_user_id,
                sender.full_name.label("sender_name"),
                ProfessorChatMessage.body,
                ProfessorChatMessage.attachment_url,
                ProfessorChatMessage.attachment_name,
                ProfessorChatMessage.attachment_mime_type,
                ProfessorChatMessage.attachment_size,
                ProfessorChatMessage.status,
                ProfessorChatMessage.created_at,
                ProfessorChatMessage.read_at,
                func.row_number()
                .over(
                    partition_by=ProfessorChatMessage.conversation_id,
                    order_by=ProfessorChatMessage.created_at.desc(),
                )
                .label("message_rank"),
            )
            .select_from(ProfessorChatMessage)
            .outerjoin(sender, sender.id == ProfessorChatMessage.sender_user_id)
            .where(ProfessorChatMessage.conversation_id.in_(conversation_ids))
            .subquery()
        )
        messages_result = await db.execute(
            select(
                ranked_messages.c.message_id,
                ranked_messages.c.conversation_id,
                ranked_messages.c.sender_user_id,
                ranked_messages.c.sender_name,
                ranked_messages.c.body,
                ranked_messages.c.attachment_url,
                ranked_messages.c.attachment_name,
                ranked_messages.c.attachment_mime_type,
                ranked_messages.c.attachment_size,
                ranked_messages.c.status,
                ranked_messages.c.created_at,
                ranked_messages.c.read_at,
            )
            .where(ranked_messages.c.message_rank <= 8)
            .order_by(
                ranked_messages.c.conversation_id,
                ranked_messages.c.created_at.asc(),
                ranked_messages.c.message_id.asc(),
            )
        )
        messages_by_conversation: dict[int, list[AdminChatMessageOut]] = {
            conversation_id: [] for conversation_id in conversation_ids
        }
        for row in messages_result.mappings().all():
            conversation_id = _int(row["conversation_id"])
            sender_user_id = _int(row["sender_user_id"])
            messages_by_conversation.setdefault(conversation_id, []).append(
                AdminChatMessageOut(
                    message_id=_int(row["message_id"]),
                    conversation_id=conversation_id,
                    sender_user_id=sender_user_id,
                    sender_name=_str(row["sender_name"]),
                    sender_role=sender_roles_by_conversation.get(conversation_id, {}).get(sender_user_id, "staff"),
                    body=_str(row["body"]),
                    attachment_url=_str(row["attachment_url"]),
                    attachment_name=_str(row["attachment_name"]),
                    attachment_mime_type=_str(row["attachment_mime_type"]),
                    attachment_size=_int(row["attachment_size"]),
                    status=_str(row["status"] or "sent"),
                    created_at=row["created_at"],
                    read_at=row["read_at"],
                )
            )
        conversations = [
            conversation.model_copy(update={"messages": messages_by_conversation.get(conversation.conversation_id, [])})
            for conversation in conversations
        ]

    live_interactions_result = await db.execute(
        select(
            LiveSessionInteraction.id.label("interaction_id"),
            LiveSessionInteraction.live_session_id,
            LiveSession.title.label("session_title"),
            LiveSessionInteraction.kind,
            LiveSessionInteraction.status,
            LiveSessionInteraction.professor_user_id,
            professor.full_name.label("professor_name"),
            LiveSessionInteraction.student_user_id,
            student.full_name.label("student_name"),
            LiveSessionInteraction.body,
            LiveSessionInteraction.answer,
            LiveSessionInteraction.created_at,
            LiveSessionInteraction.answered_at,
        )
        .select_from(LiveSessionInteraction)
        .outerjoin(LiveSession, LiveSession.id == LiveSessionInteraction.live_session_id)
        .outerjoin(professor, professor.id == LiveSessionInteraction.professor_user_id)
        .outerjoin(student, student.id == LiveSessionInteraction.student_user_id)
        .order_by(
            case((LiveSessionInteraction.status == "pending", 0), else_=1),
            LiveSessionInteraction.created_at.desc(),
        )
        .limit(bounded_limit)
    )
    live_interactions = [
        AdminLiveInteractionOut(
            interaction_id=_int(row["interaction_id"]),
            live_session_id=_int(row["live_session_id"]),
            session_title=_str(row["session_title"]),
            kind=_str(row["kind"] or "question"),
            status=_str(row["status"] or "pending"),
            professor_user_id=_int(row["professor_user_id"]),
            professor_name=_str(row["professor_name"]),
            student_user_id=_int(row["student_user_id"]),
            student_name=_str(row["student_name"]),
            body=_str(row["body"]),
            answer=_str(row["answer"]),
            created_at=row["created_at"],
            answered_at=row["answered_at"],
        )
        for row in live_interactions_result.mappings().all()
    ]

    reports_result = await db.execute(
        select(
            ContentReport.id.label("report_id"),
            ContentReport.target_type,
            ContentReport.target_id,
            ContentReport.reason,
            ContentReport.status,
            ContentReport.priority,
            ContentReport.title,
            ContentReport.description,
            ContentReport.reporter_user_id,
            reporter.full_name.label("reporter_name"),
            ContentReport.assigned_to_user_id,
            assignee.full_name.label("assigned_to_name"),
            ContentReport.created_at,
            ContentReport.updated_at,
        )
        .select_from(ContentReport)
        .outerjoin(reporter, reporter.id == ContentReport.reporter_user_id)
        .outerjoin(assignee, assignee.id == ContentReport.assigned_to_user_id)
        .order_by(
            case(
                (ContentReport.priority == "urgent", 0),
                (ContentReport.priority == "high", 1),
                (ContentReport.priority == "normal", 2),
                else_=3,
            ),
            case((ContentReport.status.in_(("open", "in_review")), 0), else_=1),
            ContentReport.created_at.desc(),
        )
        .limit(bounded_limit)
    )
    reports = [
        AdminReportQueueItemOut(
            report_id=_int(row["report_id"]),
            target_type=_str(row["target_type"]),
            target_id=_str(row["target_id"]),
            reason=_str(row["reason"]),
            status=_str(row["status"]),
            priority=_str(row["priority"]),
            title=_str(row["title"]),
            description=_str(row["description"]),
            reporter_user_id=_int(row["reporter_user_id"]),
            reporter_name=_str(row["reporter_name"]),
            assigned_to_user_id=_int(row["assigned_to_user_id"]) if row["assigned_to_user_id"] is not None else None,
            assigned_to_name=_str(row["assigned_to_name"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
        for row in reports_result.mappings().all()
    ]

    return AdminCommunicationsOut(
        generated_at=now,
        summary=summary,
        chat_conversations_by_status=await _breakdown(db, ProfessorChatConversation, ProfessorChatConversation.status),
        live_interactions_by_status=await _breakdown(db, LiveSessionInteraction, LiveSessionInteraction.status),
        reports_by_status=await _breakdown(db, ContentReport, ContentReport.status),
        reports_by_priority=await _breakdown(db, ContentReport, ContentReport.priority),
        conversations=conversations,
        live_interactions=live_interactions,
        reports=reports,
    )
