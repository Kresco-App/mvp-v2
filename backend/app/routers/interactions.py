from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.dependencies import get_current_user, get_db, get_settings
from app.models.users import User
from app.schemas.interactions import (
    CommentCreateIn,
    CommentOut,
    NoteCreateIn,
    NoteOut,
    SavedItemCreateIn,
    SavedItemOut,
)
from app.services.interaction_mutations import (
    create_topic_item_comment,
    create_user_note,
    list_topic_item_comments,
    list_user_notes,
    list_user_saves,
    save_user_item,
)

router = APIRouter(tags=["Interactions"])


@router.get("/comments", response_model=list[CommentOut])
async def list_comments(
    topic_item_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return await list_topic_item_comments(
        db,
        user=_user,
        topic_item_id=topic_item_id,
        settings=settings,
        limit=limit,
        offset=offset,
    )


@router.post("/comments", response_model=CommentOut)
async def create_comment(
    body: CommentCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return await create_topic_item_comment(db, user=user, settings=settings, body=body)


@router.get("/notes", response_model=list[NoteOut])
async def list_notes(
    subject_id: int | None = None,
    topic_id: int | None = None,
    topic_item_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_user_notes(
        db,
        user,
        subject_id=subject_id,
        topic_id=topic_id,
        topic_item_id=topic_item_id,
        limit=limit,
        offset=offset,
    )


@router.post("/notes", response_model=NoteOut)
async def create_note(
    body: NoteCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await create_user_note(db, user=user, body=body)


@router.get("/saves", response_model=list[SavedItemOut])
async def list_saves(
    subject_id: int | None = None,
    topic_id: int | None = None,
    topic_item_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_user_saves(
        db,
        user,
        subject_id=subject_id,
        topic_id=topic_id,
        topic_item_id=topic_item_id,
        limit=limit,
        offset=offset,
    )


@router.post("/saves", response_model=SavedItemOut)
async def save_item(
    body: SavedItemCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await save_user_item(db, user=user, body=body)
