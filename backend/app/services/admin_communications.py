from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.admin_audit import AdminAuditLog
from app.models.professor import (
    CourseOffering,
    ProfessorChatConversation,
    ProfessorChatMessage,
)
from app.models.users import User
from app.schemas.admin import (
    AdminChatConversationOut,
    AdminChatMessageOut,
    AdminCommunicationsOut,
    AdminCommunicationsSummaryOut,
    AdminProfessorChatGroupOut,
)
from app.services.search import LIKE_ESCAPE, normalize_substring_search, substring_search_pattern


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


def _conversation_search_filter(search: str | None, professor: Any, student: Any) -> tuple[Any | None, str]:
    normalized = normalize_substring_search(search, min_length=2)
    if not normalized:
        return None, ""

    needle = substring_search_pattern(normalized)
    sender = aliased(User)
    message_match = (
        select(ProfessorChatMessage.id)
        .select_from(ProfessorChatMessage)
        .outerjoin(sender, sender.id == ProfessorChatMessage.sender_user_id)
        .where(ProfessorChatMessage.conversation_id == ProfessorChatConversation.id)
        .where(
            or_(
                ProfessorChatMessage.body.ilike(needle, escape=LIKE_ESCAPE),
                ProfessorChatMessage.attachment_name.ilike(needle, escape=LIKE_ESCAPE),
                sender.full_name.ilike(needle, escape=LIKE_ESCAPE),
            )
        )
        .exists()
    )
    return (
        or_(
            CourseOffering.title.ilike(needle, escape=LIKE_ESCAPE),
            professor.full_name.ilike(needle, escape=LIKE_ESCAPE),
            student.full_name.ilike(needle, escape=LIKE_ESCAPE),
            ProfessorChatConversation.status.ilike(needle, escape=LIKE_ESCAPE),
            ProfessorChatConversation.last_message_preview.ilike(needle, escape=LIKE_ESCAPE),
            message_match,
        ),
        normalized,
    )


async def build_admin_communications(
    db: AsyncSession,
    *,
    limit: int = 50,
    search: str | None = None,
) -> AdminCommunicationsOut:
    now = datetime.now(timezone.utc)
    recent_since = now - timedelta(days=7)
    bounded_limit = max(1, min(int(limit or 50), 100))

    professor = aliased(User)
    student = aliased(User)
    search_filter, normalized_search = _conversation_search_filter(search, professor, student)

    total_professors = await db.scalar(
        select(func.count(func.distinct(ProfessorChatConversation.professor_user_id)))
        .select_from(ProfessorChatConversation)
    )
    students_in_private_chats = await db.scalar(
        select(func.count(func.distinct(ProfessorChatConversation.student_user_id)))
        .select_from(ProfessorChatConversation)
    )

    summary = AdminCommunicationsSummaryOut(
        total_conversations=await _count(db, ProfessorChatConversation),
        open_conversations=await _count(db, ProfessorChatConversation, ProfessorChatConversation.status == "open"),
        total_professors=_int(total_professors),
        students_in_private_chats=_int(students_in_private_chats),
        unread_for_professors=await _sum(db, ProfessorChatConversation.unread_for_professor),
        unread_for_students=await _sum(db, ProfessorChatConversation.unread_for_student),
        messages_total=await _count(db, ProfessorChatMessage),
        messages_7d=await _count(db, ProfessorChatMessage, ProfessorChatMessage.created_at >= recent_since),
        matched_conversations=0,
    )

    conversations_statement = (
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
            professor.full_name.asc(),
            ProfessorChatConversation.unread_for_professor.desc(),
            ProfessorChatConversation.last_message_at.desc(),
            ProfessorChatConversation.id.desc(),
        )
        .limit(bounded_limit)
    )
    if search_filter is not None:
        conversations_statement = conversations_statement.where(search_filter)

    conversations_result = await db.execute(conversations_statement)
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

    professors_by_id: dict[int, AdminProfessorChatGroupOut] = {}
    for conversation in conversations:
        professor_id = conversation.professor_user_id
        current = professors_by_id.get(professor_id)
        if current is None:
            current = AdminProfessorChatGroupOut(
                professor_user_id=professor_id,
                professor_name=conversation.professor_name,
                conversation_count=0,
                open_conversations=0,
                unread_for_professor=0,
                unread_for_student=0,
                messages_shown=0,
                last_message_at=conversation.last_message_at,
                conversations=[],
            )
            professors_by_id[professor_id] = current
        current.conversation_count += 1
        if conversation.status == "open":
            current.open_conversations += 1
        current.unread_for_professor += conversation.unread_for_professor
        current.unread_for_student += conversation.unread_for_student
        current.messages_shown += len(conversation.messages)
        if conversation.last_message_at and (
            current.last_message_at is None or conversation.last_message_at > current.last_message_at
        ):
            current.last_message_at = conversation.last_message_at
        current.conversations.append(conversation)

    professors = sorted(
        professors_by_id.values(),
        key=lambda group: (
            -group.unread_for_professor,
            -(group.last_message_at.timestamp() if group.last_message_at else 0),
            group.professor_name.lower(),
        ),
    )
    summary = summary.model_copy(update={"matched_conversations": len(conversations)})

    return AdminCommunicationsOut(
        generated_at=now,
        summary=summary,
        search_query=normalized_search,
        chat_conversations_by_status=await _breakdown(db, ProfessorChatConversation, ProfessorChatConversation.status),
        professors=professors,
        conversations=conversations,
    )


def record_admin_communications_read(
    db: AsyncSession,
    *,
    staff: User,
    request: Request,
    response: AdminCommunicationsOut,
    limit: int,
) -> None:
    db.add(
        AdminAuditLog(
            action="read_private_messages",
            model_name="ProfessorChatConversation",
            object_pk="",
            object_repr="Admin private message workspace",
            changed_data={
                "actor_user_id": int(staff.id),
                "limit": int(limit),
                "search_query": response.search_query,
                "professor_groups_returned": len(response.professors),
                "conversations_returned": len(response.conversations),
            },
            request_path=str(request.url.path),
            client_host=request.client.host if request.client else "",
            note=f"staff_user_id={staff.id}",
        )
    )
