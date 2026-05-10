from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.interactions import ALLOWED_TARGET_TYPES, Comment, SavedItem, UserNote
from app.models.users import User
from app.schemas.interactions import (
    CommentAuthorOut, CommentCreateIn, CommentOut, NoteCreateIn, NoteOut,
    SavedItemCreateIn, SavedItemOut,
)

router = APIRouter(tags=["Interactions"])


@router.get("/comments", response_model=list[CommentOut])
async def list_comments(
    content_type: str,
    object_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if content_type not in ALLOWED_TARGET_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid content_type. Use one of: {ALLOWED_TARGET_TYPES}")

    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.user), selectinload(Comment.replies))
        .where(
            Comment.target_type == content_type,
            Comment.target_id == object_id,
            Comment.parent_id == None,  # noqa: E711
        )
        .order_by(Comment.created_at)
    )
    comments = result.scalars().all()

    return [
        CommentOut(
            id=c.id,
            body=c.body,
            author=CommentAuthorOut(id=c.user.id, full_name=c.user.full_name, avatar_url=c.user.avatar_url or ""),
            parent_id=c.parent_id,
            reply_count=len(c.replies),
            created_at=c.created_at,
        )
        for c in comments
    ]


@router.post("/comments", response_model=CommentOut)
async def create_comment(
    body: CommentCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.content_type not in ALLOWED_TARGET_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid content_type. Use one of: {ALLOWED_TARGET_TYPES}")

    if body.parent_id is not None:
        parent_result = await db.execute(select(Comment).where(Comment.id == body.parent_id))
        if parent_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Parent comment not found")

    comment = Comment(
        user_id=user.id,
        target_type=body.content_type,
        target_id=body.object_id,
        body=body.body,
        parent_id=body.parent_id,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    return CommentOut(
        id=comment.id,
        body=comment.body,
        author=CommentAuthorOut(id=user.id, full_name=user.full_name, avatar_url=user.avatar_url or ""),
        parent_id=comment.parent_id,
        reply_count=0,
        created_at=comment.created_at,
    )


@router.get("/notes", response_model=list[NoteOut])
async def list_notes(
    topic_id: int | None = None,
    topic_item_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(UserNote).where(UserNote.user_id == user.id)
    if topic_id is not None:
        stmt = stmt.where(UserNote.topic_id == topic_id)
    if topic_item_id is not None:
        stmt = stmt.where(UserNote.topic_item_id == topic_item_id)
    result = await db.execute(stmt.order_by(UserNote.updated_at.desc()))
    return [NoteOut.model_validate(note) for note in result.scalars().all()]


@router.post("/notes", response_model=NoteOut)
async def create_note(
    body: NoteCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = UserNote(
        user_id=user.id,
        topic_id=body.topic_id,
        topic_item_id=body.topic_item_id,
        tab_content_id=body.tab_content_id,
        body=body.body,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return NoteOut.model_validate(note)


@router.get("/saves", response_model=list[SavedItemOut])
async def list_saves(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SavedItem)
        .where(SavedItem.user_id == user.id)
        .order_by(SavedItem.created_at.desc())
    )
    return [SavedItemOut.model_validate(save) for save in result.scalars().all()]


@router.post("/saves", response_model=SavedItemOut)
async def save_item(
    body: SavedItemCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.target_type not in ALLOWED_TARGET_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid target_type. Use one of: {ALLOWED_TARGET_TYPES}")
    existing = await db.execute(
        select(SavedItem).where(
            SavedItem.user_id == user.id,
            SavedItem.target_type == body.target_type,
            SavedItem.target_id == body.target_id,
        )
    )
    save = existing.scalar_one_or_none()
    if save is None:
        save = SavedItem(
            user_id=user.id,
            target_type=body.target_type,
            target_id=body.target_id,
            topic_id=body.topic_id,
            topic_item_id=body.topic_item_id,
            label=body.label,
        )
        db.add(save)
        await db.commit()
        await db.refresh(save)
    return SavedItemOut.model_validate(save)
