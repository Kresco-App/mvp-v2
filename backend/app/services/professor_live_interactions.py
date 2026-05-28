from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.professor import LiveSessionCheckpoint, LiveSessionInteraction
from app.models.users import User
from app.schemas.professor import (
    LiveSessionCheckpointIn,
    LiveSessionCheckpointOut,
    LiveSessionCheckpointPatchIn,
    LiveSessionInteractionIn,
    LiveSessionInteractionOut,
    LiveSessionInteractionPatchIn,
)
from app.services.professor_audit import enforce_professor_mutation_rate_limit, record_professor_audit
from app.services.professor_live_sessions import enqueue_live_session_event
from app.services.professor_queries import (
    require_professor_live_checkpoint,
    require_professor_live_interaction,
    require_professor_live_session,
    require_student_live_session,
)
from app.services.professor_serializers import live_interaction_out, live_session_is_joinable

ALLOWED_LIVE_INTERACTION_KINDS = {"question", "message"}
ALLOWED_LIVE_INTERACTION_STATUSES = {"pending", "answered", "hidden", "deleted"}
ALLOWED_LIVE_CHECKPOINT_TYPES = {"prompt", "quiz"}
ALLOWED_LIVE_CHECKPOINT_STATUSES = {"active", "closed", "deleted"}
LIVE_INTERACTION_BURST_LIMIT = 8
LIVE_INTERACTION_BURST_WINDOW = timedelta(seconds=10)
MAX_LIVE_INTERACTION_LIST_LIMIT = 200
MAX_LIVE_CHECKPOINT_LIST_LIMIT = 100


def clean_live_interaction_body(body: str) -> str:
    clean_body = body.strip()
    if not clean_body:
        raise HTTPException(status_code=422, detail="Message body is required")
    return clean_body


def normalize_live_interaction_kind(kind: str) -> str:
    normalized = kind.strip().casefold()
    if normalized not in ALLOWED_LIVE_INTERACTION_KINDS:
        raise HTTPException(status_code=400, detail="Unsupported live interaction kind")
    return normalized


async def enforce_live_interaction_burst_limit(db: AsyncSession, live_session_id: int, user: User) -> None:
    window_start = datetime.now(timezone.utc) - LIVE_INTERACTION_BURST_WINDOW
    count = await db.scalar(
        select(func.count())
        .select_from(LiveSessionInteraction)
        .where(
            LiveSessionInteraction.live_session_id == live_session_id,
            LiveSessionInteraction.student_user_id == user.id,
            LiveSessionInteraction.created_at >= window_start,
        )
    )
    if (count or 0) >= LIVE_INTERACTION_BURST_LIMIT:
        raise HTTPException(status_code=429, detail="Slow down before sending another live message")


async def list_professor_live_interaction_entries(
    db: AsyncSession,
    *,
    professor: User,
    live_session_id: int,
    status: str | None = None,
    kind: str | None = None,
    before_id: int | None = None,
    limit: int = 100,
) -> list[LiveSessionInteractionOut]:
    limit = min(max(limit, 1), MAX_LIVE_INTERACTION_LIST_LIMIT)
    await require_professor_live_session(db, professor, live_session_id)
    if status is not None and status not in ALLOWED_LIVE_INTERACTION_STATUSES:
        raise HTTPException(status_code=400, detail="Unsupported live interaction status")
    normalized_kind = normalize_live_interaction_kind(kind) if kind is not None else None
    stmt = (
        select(LiveSessionInteraction)
        .options(selectinload(LiveSessionInteraction.student))
        .where(LiveSessionInteraction.live_session_id == live_session_id)
        .order_by(LiveSessionInteraction.created_at.desc(), LiveSessionInteraction.id.desc())
        .limit(limit)
    )
    if status is not None:
        stmt = stmt.where(LiveSessionInteraction.status == status)
    if normalized_kind is not None:
        stmt = stmt.where(LiveSessionInteraction.kind == normalized_kind)
    if before_id is not None:
        stmt = stmt.where(LiveSessionInteraction.id < before_id)
    result = await db.execute(stmt)
    return [live_interaction_out(interaction) for interaction in result.scalars().all()]


async def list_student_live_interaction_entries(
    db: AsyncSession,
    *,
    user: User,
    live_session_id: int,
    kind: str | None = None,
    before_id: int | None = None,
    limit: int = 50,
) -> list[LiveSessionInteractionOut]:
    limit = min(max(limit, 1), MAX_LIVE_INTERACTION_LIST_LIMIT)
    await require_student_live_session(db, user, live_session_id)
    normalized_kind = normalize_live_interaction_kind(kind) if kind is not None else None
    stmt = (
        select(LiveSessionInteraction)
        .options(selectinload(LiveSessionInteraction.student))
        .where(
            LiveSessionInteraction.live_session_id == live_session_id,
            LiveSessionInteraction.status.not_in(["deleted", "hidden"]),
            or_(
                LiveSessionInteraction.kind == "message",
                LiveSessionInteraction.student_user_id == user.id,
                LiveSessionInteraction.status == "answered",
            ),
        )
        .order_by(LiveSessionInteraction.created_at.desc(), LiveSessionInteraction.id.desc())
        .limit(limit)
    )
    if normalized_kind is not None:
        stmt = stmt.where(LiveSessionInteraction.kind == normalized_kind)
    if before_id is not None:
        stmt = stmt.where(LiveSessionInteraction.id < before_id)
    result = await db.execute(stmt)
    return [live_interaction_out(interaction) for interaction in result.scalars().all()]


async def list_professor_live_checkpoint_entries(
    db: AsyncSession,
    *,
    professor: User,
    live_session_id: int,
    before_id: int | None = None,
    limit: int = 50,
) -> list[LiveSessionCheckpointOut]:
    limit = min(max(limit, 1), MAX_LIVE_CHECKPOINT_LIST_LIMIT)
    await require_professor_live_session(db, professor, live_session_id)
    stmt = select(LiveSessionCheckpoint).where(LiveSessionCheckpoint.live_session_id == live_session_id)
    if before_id is not None:
        stmt = stmt.where(LiveSessionCheckpoint.id < before_id)
    result = await db.execute(
        stmt.order_by(LiveSessionCheckpoint.created_at.desc(), LiveSessionCheckpoint.id.desc())
        .limit(limit)
    )
    return [LiveSessionCheckpointOut.model_validate(item) for item in result.scalars().all()]


async def list_student_live_checkpoint_entries(
    db: AsyncSession,
    *,
    user: User,
    live_session_id: int,
) -> list[LiveSessionCheckpointOut]:
    await require_student_live_session(db, user, live_session_id)
    result = await db.execute(
        select(LiveSessionCheckpoint)
        .where(
            LiveSessionCheckpoint.live_session_id == live_session_id,
            LiveSessionCheckpoint.status != "deleted",
        )
        .order_by(LiveSessionCheckpoint.created_at.desc(), LiveSessionCheckpoint.id.desc())
        .limit(20)
    )
    return [LiveSessionCheckpointOut.model_validate(item) for item in result.scalars().all()]


async def update_professor_live_interaction_state(
    db: AsyncSession,
    *,
    professor: User,
    request,
    interaction_id: int,
    body: LiveSessionInteractionPatchIn,
) -> LiveSessionInteractionOut:
    interaction = await require_professor_live_interaction(db, professor, interaction_id)
    await enforce_professor_mutation_rate_limit(db, professor, request)
    now = datetime.now(timezone.utc)
    if body.status is not None:
        if body.status not in ALLOWED_LIVE_INTERACTION_STATUSES:
            raise HTTPException(status_code=400, detail="Unsupported live interaction status")
        interaction.status = body.status
        if body.status == "deleted":
            interaction.deleted_at = now
        elif body.status == "answered":
            interaction.deleted_at = None
            interaction.answered_by_user_id = professor.id
            interaction.answered_at = now
        elif body.status == "pending":
            interaction.deleted_at = None
            interaction.answered_by_user_id = None
            interaction.answered_at = None
        elif body.status != "deleted":
            interaction.deleted_at = None
    if body.answer is not None:
        interaction.answer = body.answer.strip()
        if interaction.answer:
            interaction.status = "answered"
            interaction.answered_by_user_id = professor.id
            interaction.answered_at = now
        else:
            interaction.answered_by_user_id = None
            interaction.answered_at = None
            if interaction.status == "answered":
                interaction.status = "pending"
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSessionInteraction",
        object_pk=interaction.id,
        object_repr=interaction.body,
        changed_data=body.model_dump(exclude_unset=True, mode="json"),
    )
    await db.flush()
    interaction = await require_professor_live_interaction(db, professor, interaction_id)
    payload = live_interaction_out(interaction).model_dump(mode="json")
    await enqueue_live_session_event(db, interaction.live_session_id, "live.interaction.updated", payload)
    await db.commit()
    interaction = await require_professor_live_interaction(db, professor, interaction_id)
    return live_interaction_out(interaction)


async def delete_professor_live_interaction_state(
    db: AsyncSession,
    *,
    professor: User,
    request,
    interaction_id: int,
) -> LiveSessionInteractionOut:
    interaction = await require_professor_live_interaction(db, professor, interaction_id)
    await enforce_professor_mutation_rate_limit(db, professor, request)
    interaction.status = "deleted"
    interaction.deleted_at = datetime.now(timezone.utc)
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_delete",
        model_name="LiveSessionInteraction",
        object_pk=interaction.id,
        object_repr=interaction.body,
    )
    await db.flush()
    interaction = await require_professor_live_interaction(db, professor, interaction_id)
    payload = live_interaction_out(interaction).model_dump(mode="json")
    await enqueue_live_session_event(db, interaction.live_session_id, "live.interaction.deleted", payload)
    await db.commit()
    interaction = await require_professor_live_interaction(db, professor, interaction_id)
    return live_interaction_out(interaction)


async def create_student_live_interaction_state(
    db: AsyncSession,
    *,
    user: User,
    live_session_id: int,
    body: LiveSessionInteractionIn,
) -> LiveSessionInteractionOut:
    session = await require_student_live_session(db, user, live_session_id)
    if not live_session_is_joinable(session):
        raise HTTPException(status_code=409, detail="Live session is not accepting messages")
    kind = normalize_live_interaction_kind(body.kind)
    clean_body = clean_live_interaction_body(body.body)
    await enforce_live_interaction_burst_limit(db, session.id, user)
    interaction = LiveSessionInteraction(
        live_session_id=session.id,
        course_offering_id=session.course_offering_id,
        professor_user_id=session.professor_user_id,
        student_user_id=user.id,
        kind=kind,
        body=clean_body,
    )
    db.add(interaction)
    await db.flush()
    interaction_id = interaction.id
    interaction = (await db.execute(
        select(LiveSessionInteraction)
        .options(selectinload(LiveSessionInteraction.student))
        .where(LiveSessionInteraction.id == interaction_id)
    )).scalar_one()
    payload = live_interaction_out(interaction).model_dump(mode="json")
    await enqueue_live_session_event(db, interaction.live_session_id, "live.interaction.created", payload)
    await db.commit()
    return live_interaction_out(interaction)


async def create_professor_live_checkpoint_state(
    db: AsyncSession,
    *,
    professor: User,
    request,
    live_session_id: int,
    body: LiveSessionCheckpointIn,
) -> LiveSessionCheckpointOut:
    session = await require_professor_live_session(db, professor, live_session_id)
    await enforce_professor_mutation_rate_limit(db, professor, request)
    checkpoint_type = body.checkpoint_type.strip().casefold()
    if checkpoint_type not in ALLOWED_LIVE_CHECKPOINT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported live checkpoint type")
    checkpoint = LiveSessionCheckpoint(
        live_session_id=session.id,
        course_offering_id=session.course_offering_id,
        professor_user_id=professor.id,
        title=body.title.strip(),
        prompt=body.prompt.strip(),
        checkpoint_type=checkpoint_type,
    )
    db.add(checkpoint)
    await db.flush()
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_create",
        model_name="LiveSessionCheckpoint",
        object_pk=checkpoint.id,
        object_repr=checkpoint.title,
        changed_data={"live_session_id": checkpoint.live_session_id, "checkpoint_type": checkpoint.checkpoint_type},
    )
    await db.flush()
    payload = LiveSessionCheckpointOut.model_validate(checkpoint).model_dump(mode="json")
    await enqueue_live_session_event(db, checkpoint.live_session_id, "live.checkpoint.created", payload)
    await db.commit()
    await db.refresh(checkpoint)
    return LiveSessionCheckpointOut.model_validate(checkpoint)


async def update_professor_live_checkpoint_state(
    db: AsyncSession,
    *,
    professor: User,
    request,
    checkpoint_id: int,
    body: LiveSessionCheckpointPatchIn,
) -> LiveSessionCheckpointOut:
    checkpoint = await require_professor_live_checkpoint(db, professor, checkpoint_id)
    await enforce_professor_mutation_rate_limit(db, professor, request)
    if body.status is not None:
        if body.status not in ALLOWED_LIVE_CHECKPOINT_STATUSES:
            raise HTTPException(status_code=400, detail="Unsupported live checkpoint status")
        checkpoint.status = body.status
        checkpoint.closed_at = datetime.now(timezone.utc) if body.status in {"closed", "deleted"} else None
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="LiveSessionCheckpoint",
        object_pk=checkpoint.id,
        object_repr=checkpoint.title,
        changed_data=body.model_dump(exclude_unset=True, mode="json"),
    )
    await db.flush()
    payload = LiveSessionCheckpointOut.model_validate(checkpoint).model_dump(mode="json")
    await enqueue_live_session_event(db, checkpoint.live_session_id, "live.checkpoint.updated", payload)
    await db.commit()
    await db.refresh(checkpoint)
    return LiveSessionCheckpointOut.model_validate(checkpoint)
