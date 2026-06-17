"""Professor Studio service: read the editable course tree and submit batched
change requests.

The studio exposes a Chapters -> Lessons -> Tabs tree (``TopicSection`` is an
internal grouping that the apply engine manages automatically). A professor
stages operations client-side and submits them as one bundle; each operation is
persisted as a :class:`ProfessorChangeOperation` with its own review status so an
admin can approve or reject them individually.
"""
from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.courses import TabContent, Topic, TopicItem, TopicSection
from app.models.professor import CourseOffering, ProfessorChangeOperation, ProfessorChangeRequest
from app.models.users import User
from app.schemas.professor import (
    ProfessorChangeRequestDetailOut,
    StudioChapterOut,
    StudioLessonOut,
    StudioSubmitIn,
    StudioTabOut,
    StudioTreeOut,
)
from app.services.professor_audit import enforce_professor_mutation_rate_limit, record_professor_audit
from app.services.professor_queries import require_professor_offering


def _tab_out(tab: TabContent) -> StudioTabOut:
    return StudioTabOut(
        id=tab.id,
        label=tab.label or "",
        tab_type=tab.tab_type or "",
        status=tab.status or "",
        order=tab.order or 0,
        content=tab.content or "",
        resource_url=(tab.resource.url if tab.resource else ""),
        renderer_key=tab.renderer_key or "",
        config_json=tab.config_json or {},
    )


def _lesson_out(item: TopicItem) -> StudioLessonOut:
    return StudioLessonOut(
        id=item.id,
        title=item.title or "",
        description=item.description or "",
        item_type=item.item_type or "",
        status=item.status or "",
        order=item.order or 0,
        is_free_preview=bool(item.is_free_preview),
        required_tier=item.required_tier or "",
        duration_seconds=item.duration_seconds or 0,
        video_id=(
            item.primary_resource.provider_resource_id
            if item.primary_resource and (item.primary_resource.resource_type or "") == "video"
            else ""
        ),
        tabs=[_tab_out(tab) for tab in sorted(item.tabs, key=lambda t: (t.order or 0, t.id))],
    )


async def load_studio_tree(
    db: AsyncSession,
    professor: User,
    offering_id: int,
) -> StudioTreeOut:
    offering = await require_professor_offering(db, professor, offering_id)

    result = await db.execute(
        select(Topic)
        .where(Topic.course_offering_id == offering_id)
        .options(
            selectinload(Topic.sections)
            .selectinload(TopicSection.items)
            .selectinload(TopicItem.tabs)
            .selectinload(TabContent.resource),
            selectinload(Topic.sections)
            .selectinload(TopicSection.items)
            .selectinload(TopicItem.primary_resource),
        )
        .order_by(Topic.order, Topic.id)
    )
    topics = result.scalars().unique().all()

    chapters: list[StudioChapterOut] = []
    for topic in topics:
        # Flatten lessons across the topic's sections, preserving section then
        # item ordering, so the studio sees a clean Chapter -> Lesson list.
        lessons: list[StudioLessonOut] = []
        for section in sorted(topic.sections, key=lambda s: (s.order or 0, s.id)):
            for item in sorted(section.items, key=lambda i: (i.order or 0, i.id)):
                lessons.append(_lesson_out(item))
        chapters.append(
            StudioChapterOut(
                id=topic.id,
                title=topic.title or "",
                description=topic.description or "",
                status=topic.status or "",
                order=topic.order or 0,
                is_free_preview=bool(topic.is_free_preview),
                required_tier=topic.required_tier or "",
                lessons=lessons,
            )
        )

    pending_request_ids = (
        await db.execute(
            select(ProfessorChangeRequest.id).where(
                ProfessorChangeRequest.course_offering_id == offering_id,
                ProfessorChangeRequest.status.in_(["pending", "partially_applied"]),
            )
        )
    ).scalars().all()

    pending_by_entity: dict[str, list[int]] = {"chapter": [], "lesson": [], "tab": []}
    if pending_request_ids:
        op_rows = (
            await db.execute(
                select(ProfessorChangeOperation.entity_type, ProfessorChangeOperation.target_id).where(
                    ProfessorChangeOperation.change_request_id.in_(pending_request_ids),
                    ProfessorChangeOperation.status == "pending",
                    ProfessorChangeOperation.target_id.is_not(None),
                )
            )
        ).all()
        for entity_type, target_id in op_rows:
            if entity_type in pending_by_entity and target_id is not None:
                pending_by_entity[entity_type].append(target_id)

    return StudioTreeOut(
        course_offering_id=offering.id,
        offering_title=offering.title or (offering.subject.title if offering.subject else ""),
        subject_title=(offering.subject.title if offering.subject else ""),
        chapters=chapters,
        has_pending_request=len(pending_request_ids) > 0,
        pending_request_id=pending_request_ids[0] if pending_request_ids else None,
        pending_chapter_ids=sorted(set(pending_by_entity["chapter"])),
        pending_lesson_ids=sorted(set(pending_by_entity["lesson"])),
        pending_tab_ids=sorted(set(pending_by_entity["tab"])),
    )


async def _offering_target_sets(db: AsyncSession, offering_id: int) -> tuple[set[int], set[int], set[int]]:
    """Return (topic_ids, item_ids, tab_ids) belonging to the offering."""
    topic_ids = set(
        (await db.execute(select(Topic.id).where(Topic.course_offering_id == offering_id))).scalars().all()
    )
    if not topic_ids:
        return set(), set(), set()
    item_ids = set(
        (await db.execute(select(TopicItem.id).where(TopicItem.topic_id.in_(topic_ids)))).scalars().all()
    )
    tab_ids: set[int] = set()
    if item_ids:
        tab_ids = set(
            (await db.execute(select(TabContent.id).where(TabContent.topic_item_id.in_(item_ids)))).scalars().all()
        )
    return topic_ids, item_ids, tab_ids


_ENTITY_TARGET_SET_INDEX = {"chapter": 0, "lesson": 1, "tab": 2}


async def _validate_studio_operations(db: AsyncSession, offering_id: int, operations) -> None:
    """Existing targets must belong to the offering; creates register a client_ref."""
    target_sets = await _offering_target_sets(db, offering_id)
    for index, op in enumerate(operations):
        if op.op_type == "create":
            continue
        if op.target_id is None:
            raise HTTPException(status_code=400, detail=f"Operation {index} missing target_id")
        valid_ids = target_sets[_ENTITY_TARGET_SET_INDEX[op.entity_type]]
        if op.target_id not in valid_ids:
            raise HTTPException(
                status_code=403,
                detail=f"Operation {index} targets a {op.entity_type} outside this course offering",
            )


def _operation_row(change_request_id: int, seq: int, op) -> ProfessorChangeOperation:
    return ProfessorChangeOperation(
        change_request_id=change_request_id,
        seq=seq,
        op_type=op.op_type,
        entity_type=op.entity_type,
        target_id=op.target_id,
        client_ref=op.client_ref or "",
        parent_ref=op.parent_ref or "",
        payload_json=op.payload or {},
        snapshot_json=op.snapshot or {},
        status="pending",
    )


async def submit_studio_change_request(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    body: StudioSubmitIn,
) -> ProfessorChangeRequestDetailOut:
    offering = await require_professor_offering(db, professor, body.course_offering_id)
    await enforce_professor_mutation_rate_limit(db, professor, request)

    if not body.operations:
        raise HTTPException(status_code=400, detail="No operations to submit")

    await _validate_studio_operations(db, offering.id, body.operations)

    change_request = ProfessorChangeRequest(
        course_offering_id=offering.id,
        professor_user_id=professor.id,
        target_type="batch",
        target_id=0,
        change_type="batch",
        proposed_patch_json={},
        current_snapshot_json={},
        summary=body.summary or "",
        status="pending",
    )
    db.add(change_request)
    await db.flush()

    for seq, op in enumerate(body.operations):
        db.add(_operation_row(change_request.id, seq, op))

    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_create",
        model_name="ProfessorChangeRequest",
        object_pk=change_request.id,
        object_repr=f"batch:{len(body.operations)} ops",
        changed_data={
            "course_offering_id": offering.id,
            "operation_count": len(body.operations),
        },
    )
    await db.commit()

    return await load_change_request_detail(db, change_request.id)


async def load_change_request_detail(
    db: AsyncSession,
    change_request_id: int,
) -> ProfessorChangeRequestDetailOut:
    result = await db.execute(
        select(ProfessorChangeRequest)
        .where(ProfessorChangeRequest.id == change_request_id)
        .options(
            selectinload(ProfessorChangeRequest.operations),
            selectinload(ProfessorChangeRequest.professor),
            selectinload(ProfessorChangeRequest.course_offering).selectinload(CourseOffering.subject),
        )
    )
    cr = result.scalar_one_or_none()
    if cr is None:
        raise HTTPException(status_code=404, detail="Change request not found")

    offering_title = ""
    if cr.course_offering is not None:
        offering_title = cr.course_offering.title or (
            cr.course_offering.subject.title if cr.course_offering.subject else ""
        )

    detail = ProfessorChangeRequestDetailOut.model_validate(cr)
    detail.summary = cr.summary or ""
    detail.professor_name = (cr.professor.full_name if cr.professor else "") or ""
    detail.professor_email = (cr.professor.email if cr.professor else "") or ""
    detail.offering_title = offering_title
    return detail


async def _require_owned_change_request(
    db: AsyncSession, professor: User, change_request_id: int
) -> ProfessorChangeRequest:
    cr = await db.get(ProfessorChangeRequest, change_request_id)
    if cr is None:
        raise HTTPException(status_code=404, detail="Change request not found")
    # Must belong to one of the professor's active offerings.
    await require_professor_offering(db, professor, cr.course_offering_id)
    return cr


async def get_professor_change_request_detail(
    db: AsyncSession, professor: User, change_request_id: int
) -> ProfessorChangeRequestDetailOut:
    await _require_owned_change_request(db, professor, change_request_id)
    return await load_change_request_detail(db, change_request_id)


async def update_studio_change_request(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    change_request_id: int,
    body: StudioSubmitIn,
) -> ProfessorChangeRequestDetailOut:
    cr = await _require_owned_change_request(db, professor, change_request_id)
    if cr.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending requests can be edited")
    if cr.course_offering_id != body.course_offering_id:
        raise HTTPException(status_code=400, detail="Course offering mismatch")
    if not body.operations:
        raise HTTPException(status_code=400, detail="No operations to submit")

    await enforce_professor_mutation_rate_limit(db, professor, request)
    await _validate_studio_operations(db, cr.course_offering_id, body.operations)

    # Replace the pending operation set with the freshly diffed one.
    existing = (
        await db.execute(
            select(ProfessorChangeOperation).where(
                ProfessorChangeOperation.change_request_id == cr.id
            )
        )
    ).scalars().all()
    for op_row in existing:
        await db.delete(op_row)
    await db.flush()

    for seq, op in enumerate(body.operations):
        db.add(_operation_row(cr.id, seq, op))
    cr.summary = body.summary or ""
    cr.status = "pending"

    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_update",
        model_name="ProfessorChangeRequest",
        object_pk=cr.id,
        object_repr=f"batch:{len(body.operations)} ops",
        changed_data={"course_offering_id": cr.course_offering_id, "operation_count": len(body.operations)},
    )
    await db.commit()
    return await load_change_request_detail(db, cr.id)


async def withdraw_studio_change_request(
    db: AsyncSession, *, professor: User, change_request_id: int
) -> None:
    cr = await _require_owned_change_request(db, professor, change_request_id)
    if cr.status != "pending":
        raise HTTPException(status_code=409, detail="Only pending requests can be withdrawn")
    operations = (
        await db.execute(
            select(ProfessorChangeOperation).where(
                ProfessorChangeOperation.change_request_id == cr.id
            )
        )
    ).scalars().all()
    for op_row in operations:
        await db.delete(op_row)
    await db.delete(cr)
    await db.commit()
