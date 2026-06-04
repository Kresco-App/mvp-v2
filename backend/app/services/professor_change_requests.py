from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.professor import ProfessorChangeRequest
from app.models.users import User
from app.schemas.professor import ProfessorChangeRequestIn, ProfessorChangeRequestOut
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
) -> list[ProfessorChangeRequestOut]:
    limit = min(max(limit, 1), MAX_CHANGE_REQUESTS_LIMIT)
    offset = max(offset, 0)
    offerings = await professor_offerings(db, professor)
    allowed_ids = [offering.id for offering in offerings]
    if not allowed_ids:
        return []
    if status in {"", "pending"}:
        await close_dangling_change_requests(db, offering_ids=allowed_ids)
    stmt = (
        select(ProfessorChangeRequest)
        .where(ProfessorChangeRequest.course_offering_id.in_(allowed_ids))
        .order_by(ProfessorChangeRequest.created_at.desc())
    )
    if status:
        stmt = stmt.where(ProfessorChangeRequest.status == status)
    result = await db.execute(stmt.offset(offset).limit(limit))
    return [ProfessorChangeRequestOut.model_validate(item) for item in result.scalars().all()]


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
