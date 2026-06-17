from fastapi import HTTPException, Request
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.professor import CourseOffering, ProfessorChangeOperation, ProfessorChangeRequest
from app.models.users import User
from app.schemas.professor import (
    ProfessorChangeRequestIn,
    ProfessorChangeRequestOut,
    ProfessorChangeRequestSummaryOut,
)
from app.services.professor_audit import enforce_professor_mutation_rate_limit, record_professor_audit
from app.services.professor_change_request_targets import (
    ALLOWED_CHANGE_TARGETS,
    close_dangling_change_requests,
    target_belongs_to_offering,
)
from app.services.professor_queries import professor_offerings, require_professor_offering

MAX_CHANGE_REQUESTS_LIMIT = 100


async def list_professor_change_requests(
    db: AsyncSession,
    professor: User,
    *,
    status: str = "pending",
    limit: int = 50,
    offset: int = 0,
    offerings: list[CourseOffering] | None = None,
) -> list[ProfessorChangeRequestSummaryOut]:
    limit = min(max(limit, 1), MAX_CHANGE_REQUESTS_LIMIT)
    offset = max(offset, 0)
    allowed_offerings = offerings if offerings is not None else await professor_offerings(db, professor)
    allowed_ids = [offering.id for offering in allowed_offerings]
    if not allowed_ids:
        return []
    if status in {"", "pending", "all"}:
        await close_dangling_change_requests(db, offering_ids=allowed_ids)

    stmt = (
        select(ProfessorChangeRequest)
        .options(selectinload(ProfessorChangeRequest.course_offering).selectinload(CourseOffering.subject))
        .where(ProfessorChangeRequest.course_offering_id.in_(allowed_ids))
        .order_by(ProfessorChangeRequest.created_at.desc())
    )
    if status and status != "all":
        stmt = stmt.where(ProfessorChangeRequest.status == status)
    requests = (await db.execute(stmt.offset(offset).limit(limit))).scalars().unique().all()
    if not requests:
        return []

    request_ids = [cr.id for cr in requests]
    counts_rows = (
        await db.execute(
            select(
                ProfessorChangeOperation.change_request_id,
                func.count(ProfessorChangeOperation.id),
                func.sum(case((ProfessorChangeOperation.status == "pending", 1), else_=0)),
                func.sum(case((ProfessorChangeOperation.status == "applied", 1), else_=0)),
                func.sum(case((ProfessorChangeOperation.status == "rejected", 1), else_=0)),
            )
            .where(ProfessorChangeOperation.change_request_id.in_(request_ids))
            .group_by(ProfessorChangeOperation.change_request_id)
        )
    ).all()
    counts = {
        row[0]: (int(row[1] or 0), int(row[2] or 0), int(row[3] or 0), int(row[4] or 0))
        for row in counts_rows
    }

    items: list[ProfessorChangeRequestSummaryOut] = []
    for cr in requests:
        offering_title = ""
        if cr.course_offering is not None:
            offering_title = cr.course_offering.title or (
                cr.course_offering.subject.title if cr.course_offering.subject else ""
            )
        total, pending, applied, rejected = counts.get(cr.id, (0, 0, 0, 0))
        items.append(
            ProfessorChangeRequestSummaryOut(
                id=cr.id,
                course_offering_id=cr.course_offering_id,
                offering_title=offering_title,
                summary=cr.summary or "",
                status=cr.status,
                operation_count=total,
                pending_count=pending,
                applied_count=applied,
                rejected_count=rejected,
                admin_note=cr.admin_note or "",
                created_at=cr.created_at,
                reviewed_at=cr.reviewed_at,
            )
        )
    return items


async def create_professor_change_request(
    db: AsyncSession,
    *,
    professor: User,
    request: Request,
    body: ProfessorChangeRequestIn,
) -> ProfessorChangeRequestOut:
    await require_professor_offering(db, professor, body.course_offering_id)
    await enforce_professor_mutation_rate_limit(db, professor, request)
    if body.target_type not in ALLOWED_CHANGE_TARGETS:
        raise HTTPException(status_code=400, detail="Unsupported change request target")
    if not await target_belongs_to_offering(db, body.course_offering_id, body.target_type, body.target_id):
        raise HTTPException(status_code=403, detail="Target does not belong to this course offering")
    change_request = ProfessorChangeRequest(
        course_offering_id=body.course_offering_id,
        professor_user_id=professor.id,
        target_type=body.target_type,
        target_id=body.target_id,
        change_type=body.change_type,
        proposed_patch_json=body.proposed_patch_json,
        current_snapshot_json=body.current_snapshot_json,
    )
    db.add(change_request)
    await db.flush()
    record_professor_audit(
        db,
        professor=professor,
        request=request,
        action="professor_create",
        model_name="ProfessorChangeRequest",
        object_pk=change_request.id,
        object_repr=f"{change_request.target_type}:{change_request.target_id}",
        changed_data={
            "course_offering_id": change_request.course_offering_id,
            "target_type": change_request.target_type,
            "target_id": change_request.target_id,
            "change_type": change_request.change_type,
        },
    )
    await db.commit()
    await db.refresh(change_request)
    return ProfessorChangeRequestOut.model_validate(change_request)
