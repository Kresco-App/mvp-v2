"""Admin-side review of professor change requests.

Admins list pending batched requests, inspect each operation (with the
professor's proposed payload and a snapshot of the prior state for diffing), and
submit per-operation approve/reject decisions. Approvals are applied to the live
course tree by the shared apply engine.
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.professor import CourseOffering, ProfessorChangeOperation, ProfessorChangeRequest
from app.models.users import User
from app.schemas.professor import (
    AdminChangeRequestListItemOut,
    AdminReviewIn,
    ProfessorChangeRequestDetailOut,
)
from app.services.professor_change_apply import apply_change_operations
from app.services.professor_studio import load_change_request_detail

MAX_ADMIN_CHANGE_REQUESTS_LIMIT = 100


async def list_admin_change_requests(
    db: AsyncSession,
    *,
    status: str = "pending",
    limit: int = 50,
    offset: int = 0,
) -> list[AdminChangeRequestListItemOut]:
    limit = min(max(limit, 1), MAX_ADMIN_CHANGE_REQUESTS_LIMIT)
    offset = max(offset, 0)

    stmt = (
        select(ProfessorChangeRequest)
        .options(
            selectinload(ProfessorChangeRequest.professor),
            selectinload(ProfessorChangeRequest.course_offering).selectinload(CourseOffering.subject),
        )
        .order_by(ProfessorChangeRequest.created_at.desc())
    )
    if status:
        stmt = stmt.where(ProfessorChangeRequest.status == status)
    result = await db.execute(stmt.offset(offset).limit(limit))
    requests = result.scalars().unique().all()
    if not requests:
        return []

    request_ids = [cr.id for cr in requests]
    counts_rows = await db.execute(
        select(
            ProfessorChangeOperation.change_request_id,
            func.count(ProfessorChangeOperation.id),
            func.sum(case((ProfessorChangeOperation.status == "pending", 1), else_=0)),
        )
        .where(ProfessorChangeOperation.change_request_id.in_(request_ids))
        .group_by(ProfessorChangeOperation.change_request_id)
    )
    totals: dict[int, tuple[int, int]] = {
        row[0]: (int(row[1] or 0), int(row[2] or 0)) for row in counts_rows.all()
    }

    items: list[AdminChangeRequestListItemOut] = []
    for cr in requests:
        offering_title = ""
        if cr.course_offering is not None:
            offering_title = cr.course_offering.title or (
                cr.course_offering.subject.title if cr.course_offering.subject else ""
            )
        total, pending = totals.get(cr.id, (0, 0))
        items.append(
            AdminChangeRequestListItemOut(
                id=cr.id,
                course_offering_id=cr.course_offering_id,
                offering_title=offering_title,
                professor_name=(cr.professor.full_name if cr.professor else "") or "",
                professor_email=(cr.professor.email if cr.professor else "") or "",
                summary=cr.summary or "",
                status=cr.status,
                operation_count=total,
                pending_count=pending,
                created_at=cr.created_at,
                reviewed_at=cr.reviewed_at,
            )
        )
    return items


async def get_admin_change_request_detail(
    db: AsyncSession,
    change_request_id: int,
) -> ProfessorChangeRequestDetailOut:
    return await load_change_request_detail(db, change_request_id)


async def review_admin_change_request(
    db: AsyncSession,
    *,
    change_request_id: int,
    body: AdminReviewIn,
    admin_user: User,
) -> ProfessorChangeRequestDetailOut:
    cr = await db.get(ProfessorChangeRequest, change_request_id)
    if cr is None:
        raise HTTPException(status_code=404, detail="Change request not found")
    if cr.status not in {"pending", "partially_applied"}:
        raise HTTPException(status_code=409, detail=f"Change request is already '{cr.status}'")

    approve_ids = {d.operation_id for d in body.decisions if d.decision == "approve"}
    reject_ids = {d.operation_id for d in body.decisions if d.decision == "reject"}
    if not approve_ids and not reject_ids:
        raise HTTPException(status_code=400, detail="No decisions provided")

    await apply_change_operations(
        db,
        change_request=cr,
        approve_op_ids=approve_ids,
        reject_op_ids=reject_ids,
        admin_user_id=admin_user.id,
        admin_note=body.admin_note or "",
    )
    return await load_change_request_detail(db, change_request_id)
