from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import Settings
from app.database import get_or_create
from app.models.courses import ExamProblem, Resource, Subject, TabContent, Topic, TopicItem
from app.models.exercises import EXERCISE_STATUS_PUBLISHED, Exercise
from app.models.interactions import ALLOWED_TARGET_TYPES, Comment, SavedItem, UserNote
from app.models.quizzes import Question, QuestionSet
from app.models.users import User
from app.schemas.interactions import (
    CommentAuthorOut,
    CommentCreateIn,
    CommentOut,
    ExerciseCommentCreateIn,
    InteractionDeleteOut,
    NoteCreateIn,
    NoteOut,
    NoteUpdateIn,
    ResourceOpenIn,
    ResourceOpenOut,
    SavedItemCreateIn,
    SavedItemOut,
)
from app.services.access import build_access_context
from app.services.course_access import access_for_tab, access_for_topic_item, require_topic_item_access
from app.services.course_progress import get_or_create_topic_item_progress
from app.services.interaction_context import activity_metadata, infer_interaction_context
from app.services.media_storage import async_media_url

COMMENT_TAB_TYPES = {"comments", "discussion"}
SAVED_TARGET_MODELS = {
    "topic": Topic,
    "topic_item": TopicItem,
    "resource": Resource,
    "question_set": QuestionSet,
    "question": Question,
    "exam_problem": ExamProblem,
    "tab_content": TabContent,
}


async def require_comments_enabled_for_topic_item(db: AsyncSession, user: User, topic_item_id: int) -> None:
    item = await db.get(TopicItem, topic_item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Topic item not found")

    comments_tab = await db.scalar(
        select(TabContent)
        .where(
            TabContent.topic_item_id == topic_item_id,
            TabContent.status == "published",
            TabContent.tab_type.in_(COMMENT_TAB_TYPES),
        )
        .limit(1)
    )
    if comments_tab is None:
        raise HTTPException(status_code=404, detail="Comments are not enabled for this item")
    access_context = await build_access_context(db, user)
    item_access = await access_for_topic_item(db, user, item, access_context=access_context)
    tab_access = await access_for_tab(db, user, comments_tab, access_context=access_context)
    if not item_access.can_access or not tab_access.can_access:
        raise HTTPException(status_code=403, detail="Comments are locked for this item")


async def comment_out(comment: Comment, settings: Settings, *, reply_count: int = 0) -> CommentOut:
    return CommentOut(
        id=comment.id,
        topic_item_id=comment.topic_item_id,
        exercise_id=comment.exercise_id,
        body=comment.body,
        status=comment.status,
        author=CommentAuthorOut(
            id=comment.user.id,
            full_name=comment.user.full_name,
            avatar_url=await async_media_url(comment.user.avatar_url, settings),
        ),
        parent_id=comment.parent_id,
        reply_count=reply_count,
        created_at=comment.created_at,
    )


async def require_exercise_comments_access(db: AsyncSession, user: User, exercise_id: int) -> Exercise:
    exercise = await db.scalar(
        select(Exercise)
        .join(Subject, Subject.id == Exercise.subject_id)
        .outerjoin(Topic, Topic.id == Exercise.topic_id)
        .where(
            Exercise.id == exercise_id,
            Exercise.status == EXERCISE_STATUS_PUBLISHED,
            Subject.is_published == True,  # noqa: E712
            or_(Exercise.topic_id.is_(None), Topic.status == "published"),
        )
    )
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if bool(exercise.is_free_preview):
        return exercise
    access_context = await build_access_context(db, user)
    if int(exercise.subject_id) not in access_context.active_subject_ids:
        raise HTTPException(status_code=403, detail="subject_access_required")
    decision = access_context.decide_for(exercise, subject_id=int(exercise.subject_id))
    if not decision.can_access:
        raise HTTPException(status_code=403, detail=decision.locked_reason)
    return exercise


async def list_topic_item_comments(
    db: AsyncSession,
    *,
    user: User,
    topic_item_id: int,
    settings: Settings,
    limit: int = 50,
    offset: int = 0,
) -> list[CommentOut]:
    await require_comments_enabled_for_topic_item(db, user, topic_item_id)

    reply_counts = (
        select(Comment.parent_id.label("parent_id"), func.count(Comment.id).label("reply_count"))
        .where(
            Comment.topic_item_id == topic_item_id,
            Comment.parent_id.is_not(None),
            Comment.status == "visible",
        )
        .group_by(Comment.parent_id)
        .subquery()
    )
    result = await db.execute(
        select(Comment, func.coalesce(reply_counts.c.reply_count, 0).label("reply_count"))
        .outerjoin(reply_counts, reply_counts.c.parent_id == Comment.id)
        .options(selectinload(Comment.user))
        .where(
            Comment.topic_item_id == topic_item_id,
            Comment.parent_id == None,  # noqa: E711
            Comment.status == "visible",
        )
        .order_by(Comment.created_at, Comment.id)
        .offset(offset)
        .limit(limit)
    )
    return [
        await comment_out(comment, settings, reply_count=int(reply_count))
        for comment, reply_count in result.all()
    ]


def comment_parent_mismatch(parent: Comment, topic_item_id: int) -> bool:
    return parent.topic_item_id != topic_item_id


def exercise_comment_parent_mismatch(parent: Comment, exercise_id: int) -> bool:
    return parent.exercise_id != exercise_id


async def list_exercise_comments(
    db: AsyncSession,
    *,
    user: User,
    exercise_id: int,
    settings: Settings,
    limit: int = 50,
    offset: int = 0,
) -> list[CommentOut]:
    await require_exercise_comments_access(db, user, exercise_id)

    reply_counts = (
        select(Comment.parent_id.label("parent_id"), func.count(Comment.id).label("reply_count"))
        .where(
            Comment.exercise_id == exercise_id,
            Comment.parent_id.is_not(None),
            Comment.status == "visible",
        )
        .group_by(Comment.parent_id)
        .subquery()
    )
    result = await db.execute(
        select(Comment, func.coalesce(reply_counts.c.reply_count, 0).label("reply_count"))
        .outerjoin(reply_counts, reply_counts.c.parent_id == Comment.id)
        .options(selectinload(Comment.user))
        .where(
            Comment.exercise_id == exercise_id,
            Comment.parent_id == None,  # noqa: E711
            Comment.status == "visible",
        )
        .order_by(Comment.created_at, Comment.id)
        .offset(offset)
        .limit(limit)
    )
    return [
        await comment_out(comment, settings, reply_count=int(reply_count))
        for comment, reply_count in result.all()
    ]


async def require_saved_target_exists(db: AsyncSession, target_type: str, target_id: int) -> None:
    model = SAVED_TARGET_MODELS.get(target_type)
    if model is None:
        raise HTTPException(status_code=400, detail=f"Invalid target_type. Use one of: {ALLOWED_TARGET_TYPES}")
    if await db.get(model, target_id) is None:
        raise HTTPException(status_code=404, detail="Saved item target not found")


async def require_interaction_context_access(
    db: AsyncSession,
    user: User,
    context: dict[str, int | None],
) -> None:
    tab_content_id = context.get("tab_content_id")
    if tab_content_id is not None:
        tab = await db.scalar(
            select(TabContent)
            .options(selectinload(TabContent.topic_item).selectinload(TopicItem.topic))
            .where(TabContent.id == int(tab_content_id))
        )
        if tab is None:
            raise HTTPException(status_code=404, detail="Tab not found")
        decision = await access_for_tab(db, user, tab)
        if not decision.can_access:
            raise HTTPException(status_code=403, detail=decision.locked_reason)
        return

    topic_item_id = context.get("topic_item_id")
    if topic_item_id is not None:
        await require_topic_item_access(db, user, int(topic_item_id))
        return

    topic_id = context.get("topic_id")
    if topic_id is not None:
        topic = await db.get(Topic, int(topic_id))
        if topic is None:
            raise HTTPException(status_code=404, detail="Topic not found")
        access_context = await build_access_context(db, user)
        decision = access_context.decide_for(topic, subject_id=topic.subject_id)
        if not decision.can_access:
            raise HTTPException(status_code=403, detail=decision.locked_reason)
        return

    subject_id = context.get("subject_id")
    if subject_id is not None:
        subject = await db.get(Subject, int(subject_id))
        if subject is None:
            raise HTTPException(status_code=404, detail="Subject not found")
        access_context = await build_access_context(db, user)
        decision = access_context.decide_for(subject, subject_id=subject.id)
        if not decision.can_access:
            raise HTTPException(status_code=403, detail=decision.locked_reason)


async def create_topic_item_comment(
    db: AsyncSession,
    *,
    user: User,
    settings: Settings,
    body: CommentCreateIn,
) -> CommentOut:
    await require_comments_enabled_for_topic_item(db, user, body.topic_item_id)

    if body.parent_id is not None:
        parent = await db.get(Comment, body.parent_id)
        if parent is None or parent.status != "visible":
            raise HTTPException(status_code=404, detail="Parent comment not found")
        if comment_parent_mismatch(parent, body.topic_item_id):
            raise HTTPException(status_code=400, detail="Parent comment belongs to a different item")

    comment = Comment(
        user_id=user.id,
        topic_item_id=body.topic_item_id,
        body=body.body,
        parent_id=body.parent_id,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    comment.user = user
    return await comment_out(comment, settings)


async def create_exercise_comment(
    db: AsyncSession,
    *,
    user: User,
    settings: Settings,
    body: ExerciseCommentCreateIn,
) -> CommentOut:
    await require_exercise_comments_access(db, user, body.exercise_id)

    if body.parent_id is not None:
        parent = await db.get(Comment, body.parent_id)
        if parent is None or parent.status != "visible":
            raise HTTPException(status_code=404, detail="Parent comment not found")
        if exercise_comment_parent_mismatch(parent, body.exercise_id):
            raise HTTPException(status_code=400, detail="Parent comment belongs to a different exercise")

    comment = Comment(
        user_id=user.id,
        exercise_id=body.exercise_id,
        body=body.body,
        parent_id=body.parent_id,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    comment.user = user
    return await comment_out(comment, settings)


async def list_user_notes(
    db: AsyncSession,
    user: User,
    *,
    subject_id: int | None = None,
    topic_id: int | None = None,
    topic_item_id: int | None = None,
    tab_content_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[NoteOut]:
    stmt = select(UserNote).where(UserNote.user_id == user.id)
    if subject_id is not None:
        stmt = stmt.where(UserNote.subject_id == subject_id)
    if topic_id is not None:
        stmt = stmt.where(UserNote.topic_id == topic_id)
    if topic_item_id is not None:
        stmt = stmt.where(UserNote.topic_item_id == topic_item_id)
    if tab_content_id is not None:
        stmt = stmt.where(UserNote.tab_content_id == tab_content_id)
    result = await db.execute(stmt.order_by(UserNote.updated_at.desc(), UserNote.id.desc()).offset(offset).limit(limit))
    return [NoteOut.model_validate(note) for note in result.scalars().all()]


async def create_user_note(
    db: AsyncSession,
    *,
    user: User,
    body: NoteCreateIn,
) -> NoteOut:
    context = await infer_interaction_context(
        db,
        subject_id=body.subject_id,
        topic_id=body.topic_id,
        topic_item_id=body.topic_item_id,
        tab_content_id=body.tab_content_id,
    )
    await require_interaction_context_access(db, user, context)
    note = UserNote(
        user_id=user.id,
        subject_id=context.get("subject_id"),
        topic_id=context.get("topic_id"),
        topic_item_id=context.get("topic_item_id"),
        tab_content_id=context.get("tab_content_id"),
        body=body.body,
    )
    db.add(note)
    await db.flush()
    await db.commit()
    await db.refresh(note)
    return NoteOut.model_validate(note)


async def require_owned_user_note(
    db: AsyncSession,
    *,
    user: User,
    note_id: int,
) -> UserNote:
    note = await db.scalar(
        select(UserNote).where(
            UserNote.id == note_id,
            UserNote.user_id == user.id,
        )
    )
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


async def update_user_note(
    db: AsyncSession,
    *,
    user: User,
    note_id: int,
    body: NoteUpdateIn,
) -> NoteOut:
    note = await require_owned_user_note(db, user=user, note_id=note_id)
    note.body = body.body
    await db.commit()
    await db.refresh(note)
    return NoteOut.model_validate(note)


async def delete_user_note(
    db: AsyncSession,
    *,
    user: User,
    note_id: int,
) -> InteractionDeleteOut:
    note = await require_owned_user_note(db, user=user, note_id=note_id)
    await db.delete(note)
    await db.commit()
    return InteractionDeleteOut(ok=True, id=note_id)


async def list_user_saves(
    db: AsyncSession,
    user: User,
    *,
    subject_id: int | None = None,
    topic_id: int | None = None,
    topic_item_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[SavedItemOut]:
    stmt = select(SavedItem).where(SavedItem.user_id == user.id)
    if subject_id is not None:
        stmt = stmt.where(SavedItem.subject_id == subject_id)
    if topic_id is not None:
        stmt = stmt.where(SavedItem.topic_id == topic_id)
    if topic_item_id is not None:
        stmt = stmt.where(SavedItem.topic_item_id == topic_item_id)
    result = await db.execute(stmt.order_by(SavedItem.created_at.desc()).offset(offset).limit(limit))
    return [SavedItemOut.model_validate(save) for save in result.scalars().all()]


async def save_user_item(
    db: AsyncSession,
    *,
    user: User,
    body: SavedItemCreateIn,
) -> SavedItemOut:
    if body.target_type not in ALLOWED_TARGET_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid target_type. Use one of: {ALLOWED_TARGET_TYPES}")
    await require_saved_target_exists(db, body.target_type, body.target_id)
    context = await infer_interaction_context(
        db,
        subject_id=body.subject_id,
        topic_id=body.topic_id,
        topic_item_id=body.topic_item_id,
        target_type=body.target_type,
        target_id=body.target_id,
    )
    await require_interaction_context_access(db, user, context)

    save, created = await get_or_create(
        db,
        SavedItem,
        defaults={
            "subject_id": context.get("subject_id"),
            "topic_id": context.get("topic_id"),
            "topic_item_id": context.get("topic_item_id"),
            "label": body.label,
        },
        user_id=user.id,
        target_type=body.target_type,
        target_id=body.target_id,
    )

    if not created:
        save.subject_id = save.subject_id if save.subject_id is not None else context.get("subject_id")
        save.topic_id = save.topic_id if save.topic_id is not None else context.get("topic_id")
        save.topic_item_id = save.topic_item_id if save.topic_item_id is not None else context.get("topic_item_id")
        if body.label and body.label != save.label:
            save.label = body.label

    await db.commit()
    await db.refresh(save)
    return SavedItemOut.model_validate(save)


async def require_owned_saved_item(
    db: AsyncSession,
    *,
    user: User,
    save_id: int,
) -> SavedItem:
    save = await db.scalar(
        select(SavedItem).where(
            SavedItem.id == save_id,
            SavedItem.user_id == user.id,
        )
    )
    if save is None:
        raise HTTPException(status_code=404, detail="Saved item not found")
    return save


async def delete_user_save(
    db: AsyncSession,
    *,
    user: User,
    save_id: int,
) -> InteractionDeleteOut:
    save = await require_owned_saved_item(db, user=user, save_id=save_id)
    await db.delete(save)
    await db.commit()
    return InteractionDeleteOut(ok=True, id=save_id)


async def require_owned_comment(
    db: AsyncSession,
    *,
    user: User,
    comment_id: int,
) -> Comment:
    comment = await db.scalar(
        select(Comment).where(
            Comment.id == comment_id,
            Comment.user_id == user.id,
            Comment.status == "visible",
        )
    )
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    return comment


async def delete_topic_item_comment(
    db: AsyncSession,
    *,
    user: User,
    comment_id: int,
) -> InteractionDeleteOut:
    await require_owned_comment(db, user=user, comment_id=comment_id)
    await db.execute(delete(Comment).where(Comment.id == comment_id))
    await db.commit()
    return InteractionDeleteOut(ok=True, id=comment_id)


async def _workspace_tab_for_resource(
    db: AsyncSession,
    *,
    resource_id: int,
    tab_content_id: int | None,
) -> TabContent | None:
    stmt = (
        select(TabContent)
        .options(selectinload(TabContent.topic_item).selectinload(TopicItem.topic))
        .where(TabContent.status == "published")
        .order_by(TabContent.order, TabContent.id)
    )
    if tab_content_id is not None:
        stmt = stmt.where(TabContent.id == tab_content_id)
    else:
        stmt = stmt.where(TabContent.resource_id == resource_id)
    return await db.scalar(stmt.limit(1))


async def _workspace_item_for_resource(
    db: AsyncSession,
    *,
    resource_id: int,
    topic_item_id: int | None,
) -> TopicItem | None:
    stmt = (
        select(TopicItem)
        .options(selectinload(TopicItem.topic))
        .where(
            TopicItem.status == "published",
            TopicItem.primary_resource_id == resource_id,
        )
        .order_by(TopicItem.order, TopicItem.id)
    )
    if topic_item_id is not None:
        stmt = stmt.where(TopicItem.id == topic_item_id)
    return await db.scalar(stmt.limit(1))


async def open_topic_workspace_resource(
    db: AsyncSession,
    *,
    user: User,
    resource_id: int,
    body: ResourceOpenIn | None = None,
) -> ResourceOpenOut:
    payload = body or ResourceOpenIn()
    resource = await db.get(Resource, resource_id)
    if resource is None or resource.status != "published":
        raise HTTPException(status_code=404, detail="Resource not found")

    tab = await _workspace_tab_for_resource(db, resource_id=resource_id, tab_content_id=payload.tab_content_id)
    if payload.tab_content_id is not None and tab is None:
        raise HTTPException(status_code=404, detail="Tab not found")
    item: TopicItem | None = None
    topic: Topic | None = None
    tab_access = None
    item_access = None
    resource_access = None

    if tab is not None:
        item = tab.topic_item
        if item is None:
            raise HTTPException(status_code=404, detail="Topic item not found")
        if payload.topic_item_id is not None and payload.topic_item_id != item.id:
            raise HTTPException(status_code=400, detail="Tab belongs to a different topic item")
        if resource_id not in {tab.resource_id, item.primary_resource_id}:
            raise HTTPException(status_code=400, detail="Tab does not reference this resource")
        tab_access = await access_for_tab(db, user, tab)
        if not tab_access.can_access:
            raise HTTPException(status_code=403, detail=tab_access.locked_reason)
        topic = item.topic
        if topic is None:
            raise HTTPException(status_code=404, detail="Topic not found")
        access_context = await build_access_context(db, user)
        resource_access = access_context.decide_child(tab_access, resource, subject_id=topic.subject_id)
    else:
        item = await _workspace_item_for_resource(db, resource_id=resource_id, topic_item_id=payload.topic_item_id)
        if item is not None:
            item_access = await access_for_topic_item(db, user, item)
            if not item_access.can_access:
                raise HTTPException(status_code=403, detail=item_access.locked_reason)
            topic = item.topic
            if topic is None:
                raise HTTPException(status_code=404, detail="Topic not found")
            access_context = await build_access_context(db, user)
            resource_access = access_context.decide_child(item_access, resource, subject_id=topic.subject_id)
    if item is None and payload.topic_item_id is not None:
        raise HTTPException(status_code=404, detail="Topic item not found")
    if item is None:
        raise HTTPException(status_code=404, detail="Resource is not attached to a topic workspace item")
    if resource_access is None:
        raise HTTPException(status_code=404, detail="Resource context could not be resolved")
    if not resource_access.can_access:
        raise HTTPException(status_code=403, detail=resource_access.locked_reason)

    now = datetime.now(timezone.utc)
    progress = await get_or_create_topic_item_progress(
        db,
        user_id=user.id,
        topic_id=item.topic_id,
        topic_item_id=item.id,
    )
    if progress.status != "completed":
        progress.status = "started"
    progress.updated_at = now
    await db.commit()

    return ResourceOpenOut(
        ok=True,
        resource_id=resource.id,
        title=resource.title,
        resource_type=resource.resource_type,
        progress_status=progress.status,
        opened_at=now,
        **activity_metadata(
            subject_id=topic.subject_id if topic else None,
            topic_id=item.topic_id if item else resource.topic_id,
            topic_item_id=item.id if item else None,
            tab_content_id=tab.id if tab else None,
        ),
    )
