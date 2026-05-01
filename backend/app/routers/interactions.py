from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.interactions import ALLOWED_TARGET_TYPES, Comment
from app.models.users import User
from app.schemas.interactions import CommentAuthorOut, CommentCreateIn, CommentOut

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
