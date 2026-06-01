from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.dependencies import get_current_user, get_db, get_settings
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.interactions import (
    CommentCreateIn,
    CommentOut,
    InteractionDeleteOut,
    NoteCreateIn,
    NoteOut,
    NoteUpdateIn,
    SavedItemCreateIn,
    SavedItemOut,
)
from app.services.interaction_mutations import (
    create_topic_item_comment,
    create_user_note,
    delete_user_note,
    list_topic_item_comments,
    list_user_notes,
    list_user_saves,
    save_user_item,
    update_user_note,
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
@limiter.limit("20/minute")
async def create_comment(
    request: Request,
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
    tab_content_id: int | None = None,
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
        tab_content_id=tab_content_id,
        limit=limit,
        offset=offset,
    )


@router.post("/notes", response_model=NoteOut)
@limiter.limit("20/minute")
async def create_note(
    request: Request,
    body: NoteCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    return await create_user_note(db, user=user, body=body)


@router.patch("/notes/{note_id}", response_model=NoteOut)
@limiter.limit("20/minute")
async def update_note(
    request: Request,
    note_id: int,
    body: NoteUpdateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    return await update_user_note(db, user=user, note_id=note_id, body=body)


@router.delete("/notes/{note_id}", response_model=InteractionDeleteOut)
@limiter.limit("20/minute")
async def delete_note(
    request: Request,
    note_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    return await delete_user_note(db, user=user, note_id=note_id)


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
@limiter.limit("20/minute")
async def save_item(
    request: Request,
    body: SavedItemCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    return await save_user_item(db, user=user, body=body)
