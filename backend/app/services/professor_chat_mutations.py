from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, UploadFile
from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import Settings
from app.models.professor import CourseOffering, ProfessorChatConversation, ProfessorChatMessage
from app.models.users import User
from app.schemas.professor import (
    ChatConversationPatchIn,
    ChatMessageIn,
    ChatMessagePatchIn,
    ProfessorChatConversationOut,
    ProfessorChatMessageOut,
    StudentStartConversationIn,
)
from app.services.image_uploads import (
    allowed_image_extension,
    image_matches_mime_type,
    normalize_image_mime_type,
)
from app.services.media_storage import get_media_storage, professor_chat_media_key, safe_original_filename
from app.services.professor_audit import enforce_professor_mutation_rate_limit, record_professor_audit
from app.services.professor_queries import (
    ensure_student_matches_offering,
    ensure_student_professor_chat_access,
    messages_for_conversation,
    require_professor_conversation,
    require_student_conversation,
)
from app.services.professor_serializers import chat_datetime, conversation_out, message_out
from app.services.realtime_outbox import enqueue_realtime_event

MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024
CHAT_MESSAGE_EDIT_WINDOW = timedelta(minutes=15)
RequireProfessorActiveOfferingFn = Callable[[AsyncSession, User], Awaitable[object]]


def touch_conversation(conversation: ProfessorChatConversation, body: str) -> None:
    now = datetime.now(timezone.utc)
    conversation.last_message_preview = body.strip().replace("\n", " ")[:255] or "Image"
    conversation.last_message_at = now
    conversation.updated_at = now


async def adjust_professor_unread_chat_count(db: AsyncSession, professor_user_id: int, delta: int) -> None:
    if delta == 0:
        return
    if delta > 0:
        values = {"professor_unread_chat_count": User.professor_unread_chat_count + delta}
    else:
        amount = abs(delta)
        values = {
            "professor_unread_chat_count": case(
                (User.professor_unread_chat_count >= amount, User.professor_unread_chat_count - amount),
                else_=0,
            )
        }
    await db.execute(
        update(User)
        .where(User.id == professor_user_id)
        .values(**values)
        .execution_options(synchronize_session=False)
    )


async def apply_professor_sent_message_update(
    db: AsyncSession,
    conversation: ProfessorChatConversation,
    body: str,
) -> None:
    touch_conversation(conversation, body)
    cleared_professor_unread = int(conversation.unread_for_professor or 0)
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
    await adjust_professor_unread_chat_count(db, conversation.professor_user_id, -cleared_professor_unread)


async def apply_student_sent_message_update(
    db: AsyncSession,
    conversation: ProfessorChatConversation,
    body: str,
) -> None:
    touch_conversation(conversation, body)
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
    await adjust_professor_unread_chat_count(db, conversation.professor_user_id, 1)


async def deleted_message_is_unread_tail(
    db: AsyncSession,
    message: ProfessorChatMessage,
    conversation: ProfessorChatConversation,
    unread_count: int,
) -> bool:
    if unread_count <= 0:
        return False

    rank_from_newest = int(await db.scalar(
        select(func.count())
        .select_from(ProfessorChatMessage)
        .where(
            ProfessorChatMessage.conversation_id == conversation.id,
            ProfessorChatMessage.sender_user_id == message.sender_user_id,
            or_(
                ProfessorChatMessage.created_at > message.created_at,
                and_(
                    ProfessorChatMessage.created_at == message.created_at,
                    ProfessorChatMessage.id >= message.id,
                ),
            ),
        )
    ) or 0)
    return rank_from_newest <= unread_count


async def reconcile_deleted_message_unread_counter(
    db: AsyncSession,
    message: ProfessorChatMessage,
    conversation: ProfessorChatConversation,
) -> None:
    if message.sender_user_id == conversation.student_user_id:
        if not await deleted_message_is_unread_tail(db, message, conversation, conversation.unread_for_professor):
            return
        await db.execute(
            update(ProfessorChatConversation)
            .where(
                ProfessorChatConversation.id == conversation.id,
                ProfessorChatConversation.unread_for_professor > 0,
            )
            .values(unread_for_professor=ProfessorChatConversation.unread_for_professor - 1)
            .execution_options(synchronize_session=False)
        )
        await adjust_professor_unread_chat_count(db, conversation.professor_user_id, -1)
        return

    if message.sender_user_id == conversation.professor_user_id:
        if not await deleted_message_is_unread_tail(db, message, conversation, conversation.unread_for_student):
            return
        await db.execute(
            update(ProfessorChatConversation)
            .where(
                ProfessorChatConversation.id == conversation.id,
                ProfessorChatConversation.unread_for_student > 0,
            )
            .values(unread_for_student=ProfessorChatConversation.unread_for_student - 1)
            .execution_options(synchronize_session=False)
        )


async def refresh_chat_preview(db: AsyncSession, conversation: ProfessorChatConversation) -> None:
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


async def chat_media_used_bytes(db: AsyncSession, conversation_id: int) -> int:
    used = await db.scalar(
        select(func.coalesce(func.sum(ProfessorChatMessage.attachment_size), 0))
        .where(
            ProfessorChatMessage.conversation_id == conversation_id,
            ProfessorChatMessage.attachment_size > 0,
        )
    )
    return int(used or 0)


async def save_chat_image(
    db: AsyncSession,
    settings: Settings,
    conversation_id: int,
    file: UploadFile,
) -> tuple[str, str, str, int]:
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
    used_bytes = await chat_media_used_bytes(db, conversation_id)
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


async def require_owned_chat_message(
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


async def list_professor_messages_for_conversation(
    db: AsyncSession,
    *,
    professor: User,
    conversation_id: int,
    settings: Settings,
    limit: int,
    before_id: int | None,
) -> list[ProfessorChatMessageOut]:
    conversation = await require_professor_conversation(db, professor, conversation_id)
    if conversation.unread_for_professor > 0:
        unread_delta = int(conversation.unread_for_professor)
        await db.execute(
            update(ProfessorChatConversation)
            .where(
                ProfessorChatConversation.id == conversation.id,
                ProfessorChatConversation.unread_for_professor > 0,
            )
            .values(unread_for_professor=0)
        )
        await adjust_professor_unread_chat_count(db, conversation.professor_user_id, -unread_delta)
        await db.commit()
    return await messages_for_conversation(db, conversation_id, settings, limit=limit, before_id=before_id)


async def send_professor_message_state(
    db: AsyncSession,
    *,
    professor: User,
    conversation_id: int,
    body: ChatMessageIn,
    request: Request,
    settings: Settings,
) -> ProfessorChatMessageOut:
    conversation = await require_professor_conversation(db, professor, conversation_id, for_update=True)
    await enforce_professor_mutation_rate_limit(db, professor, request)
    message = ProfessorChatMessage(conversation_id=conversation.id, sender_user_id=professor.id, body=body.body)
    db.add(message)
    await apply_professor_sent_message_update(db, conversation, body.body)
    await db.flush()
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_create",
        model_name="ProfessorChatMessage",
        object_pk=message.id,
        object_repr=conversation.last_message_preview,
        changed_data={"conversation_id": conversation.id},
    )
    await publish_chat_message_change(db, conversation, professor, "professor.chat.message", message.id)
    await db.commit()
    await db.refresh(message)
    return await message_out(message, professor.role, settings)


async def send_professor_image_message_state(
    db: AsyncSession,
    *,
    professor: User,
    conversation_id: int,
    body: str,
    file: UploadFile,
    request: Request,
    settings: Settings,
) -> ProfessorChatMessageOut:
    conversation = await require_professor_conversation(db, professor, conversation_id, for_update=True)
    await enforce_professor_mutation_rate_limit(db, professor, request)
    attachment_url, attachment_mime_type, attachment_name, attachment_size = await save_chat_image(
        db,
        settings,
        conversation.id,
        file,
    )
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
    await apply_professor_sent_message_update(db, conversation, clean_body or "Image")
    await db.flush()
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_create",
        model_name="ProfessorChatMessage",
        object_pk=message.id,
        object_repr=conversation.last_message_preview,
        changed_data={"conversation_id": conversation.id, "attachment_mime_type": attachment_mime_type},
    )
    await publish_chat_message_change(db, conversation, professor, "professor.chat.message", message.id)
    await db.commit()
    await db.refresh(message)
    return await message_out(message, professor.role, settings)


async def update_chat_message_state(
    db: AsyncSession,
    *,
    user: User,
    message_id: int,
    body: ChatMessagePatchIn,
    request: Request,
    settings: Settings,
    require_professor_active_offering_fn: RequireProfessorActiveOfferingFn,
) -> ProfessorChatMessageOut:
    message, conversation = await require_owned_chat_message(db, user, message_id)
    if user.role == "professor":
        await require_professor_active_offering_fn(db, user)
        await enforce_professor_mutation_rate_limit(db, user, request)
    if datetime.now(timezone.utc) - chat_datetime(message.created_at) > CHAT_MESSAGE_EDIT_WINDOW:
        raise HTTPException(status_code=403, detail="Messages can only be edited for 15 minutes")

    clean_body = body.body.strip()
    if not clean_body:
        raise HTTPException(status_code=422, detail="Message body is required")

    message.body = clean_body
    await refresh_chat_preview(db, conversation)
    if user.role == "professor":
        record_professor_audit(
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
    return await message_out(message, user.role, settings)


async def delete_chat_message_state(
    db: AsyncSession,
    *,
    user: User,
    message_id: int,
    request: Request,
    require_professor_active_offering_fn: RequireProfessorActiveOfferingFn,
) -> dict[str, bool]:
    message, conversation = await require_owned_chat_message(db, user, message_id)
    if user.role == "professor":
        await require_professor_active_offering_fn(db, user)
        await enforce_professor_mutation_rate_limit(db, user, request)
    else:
        ensure_student_professor_chat_access(user)
    if datetime.now(timezone.utc) - chat_datetime(message.created_at) > CHAT_MESSAGE_EDIT_WINDOW:
        raise HTTPException(status_code=403, detail="Messages can only be deleted for 15 minutes")
    await reconcile_deleted_message_unread_counter(db, message, conversation)
    await db.delete(message)
    await db.flush()
    await refresh_chat_preview(db, conversation)
    if user.role == "professor":
        record_professor_audit(
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


async def patch_professor_conversation_state(
    db: AsyncSession,
    *,
    professor: User,
    conversation_id: int,
    body: ChatConversationPatchIn,
    request: Request,
    settings: Settings,
) -> ProfessorChatConversationOut:
    conversation = await require_professor_conversation(db, professor, conversation_id, for_update=True)
    await enforce_professor_mutation_rate_limit(db, professor, request)
    if body.is_pinned_by_professor is not None:
        conversation.is_pinned_by_professor = body.is_pinned_by_professor
    if body.mark_read:
        unread_delta = int(conversation.unread_for_professor or 0)
        conversation.unread_for_professor = 0
        await adjust_professor_unread_chat_count(db, conversation.professor_user_id, -unread_delta)
    record_professor_audit(
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
    return await conversation_out(conversation, settings)


async def start_student_conversation_state(
    db: AsyncSession,
    *,
    user: User,
    body: StudentStartConversationIn,
    settings: Settings,
) -> ProfessorChatConversationOut:
    ensure_student_professor_chat_access(user)
    result = await db.execute(
        select(CourseOffering)
        .options(selectinload(CourseOffering.subject), selectinload(CourseOffering.track), selectinload(CourseOffering.professor))
        .where(CourseOffering.id == body.course_offering_id, CourseOffering.status == "active")
        .with_for_update()
    )
    offering = result.scalar_one_or_none()
    if offering is None:
        raise HTTPException(status_code=404, detail="Course offering not found")
    ensure_student_matches_offering(user, offering)

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
    await adjust_professor_unread_chat_count(db, offering.professor_user_id, 1)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Conversation already exists")
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
    return await conversation_out(result.scalar_one(), settings)


async def list_student_messages_for_conversation(
    db: AsyncSession,
    *,
    user: User,
    conversation_id: int,
    settings: Settings,
    limit: int,
    before_id: int | None,
) -> list[ProfessorChatMessageOut]:
    ensure_student_professor_chat_access(user)
    conversation = await require_student_conversation(db, user, conversation_id)
    if conversation.unread_for_student > 0:
        await db.execute(
            update(ProfessorChatConversation)
            .where(
                ProfessorChatConversation.id == conversation.id,
                ProfessorChatConversation.unread_for_student > 0,
            )
            .values(unread_for_student=0)
        )
        await db.commit()
    return await messages_for_conversation(db, conversation_id, settings, limit=limit, before_id=before_id)


async def send_student_message_state(
    db: AsyncSession,
    *,
    user: User,
    conversation_id: int,
    body: ChatMessageIn,
    settings: Settings,
) -> ProfessorChatMessageOut:
    ensure_student_professor_chat_access(user)
    conversation = await require_student_conversation(db, user, conversation_id, for_update=True)
    message = ProfessorChatMessage(conversation_id=conversation.id, sender_user_id=user.id, body=body.body)
    db.add(message)
    await apply_student_sent_message_update(db, conversation, body.body)
    await db.flush()
    await publish_chat_message_change(db, conversation, user, "professor.chat.message", message.id)
    await db.commit()
    await db.refresh(message)
    return await message_out(message, user.role, settings)


async def send_student_image_message_state(
    db: AsyncSession,
    *,
    user: User,
    conversation_id: int,
    body: str,
    file: UploadFile,
    settings: Settings,
) -> ProfessorChatMessageOut:
    ensure_student_professor_chat_access(user)
    conversation = await require_student_conversation(db, user, conversation_id, for_update=True)
    attachment_url, attachment_mime_type, attachment_name, attachment_size = await save_chat_image(
        db,
        settings,
        conversation.id,
        file,
    )
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
    await apply_student_sent_message_update(db, conversation, clean_body or "Image")
    await db.flush()
    await publish_chat_message_change(db, conversation, user, "professor.chat.message", message.id)
    await db.commit()
    await db.refresh(message)
    return await message_out(message, user.role, settings)
