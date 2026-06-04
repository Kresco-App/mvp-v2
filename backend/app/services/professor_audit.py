from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_audit import AdminAuditLog
from app.models.users import User

PROFESSOR_MUTATION_BURST_LIMIT = 12
PROFESSOR_MUTATION_BURST_WINDOW = timedelta(minutes=1)


def _route_template(request: Request) -> str:
    route = request.scope.get("route")
    template = str(getattr(route, "path", "") or "")
    return template or str(request.url.path)


def _rate_limit_path_filter(request: Request):
    template = _route_template(request)
    if "{" not in template:
        return AdminAuditLog.request_path == str(request.url.path)
    like_pattern = ""
    in_parameter = False
    for char in template:
        if char == "{":
            in_parameter = True
            like_pattern += "%"
            continue
        if char == "}":
            in_parameter = False
            continue
        if not in_parameter:
            like_pattern += char
    return AdminAuditLog.request_path.like(like_pattern)


async def enforce_professor_mutation_rate_limit(db: AsyncSession, professor: User, request: Request) -> None:
    window_start = datetime.now(timezone.utc) - PROFESSOR_MUTATION_BURST_WINDOW
    marker = f"professor_user_id={professor.id}"
    count = await db.scalar(
        select(func.count())
        .select_from(AdminAuditLog)
        .where(
            AdminAuditLog.note == marker,
            _rate_limit_path_filter(request),
            AdminAuditLog.created_at >= window_start,
        )
    )
    if (count or 0) >= PROFESSOR_MUTATION_BURST_LIMIT:
        raise HTTPException(status_code=429, detail="Slow down before submitting more professor changes")


def record_professor_audit(
    db: AsyncSession,
    *,
    professor: User | None = None,
    professor_id: int | None = None,
    request: Request,
    action: str,
    model_name: str,
    object_pk: int | str,
    object_repr: str,
    changed_data: dict | None = None,
) -> None:
    if professor_id is None:
        if professor is None:
            raise ValueError("professor or professor_id is required")
        professor_id = professor.id
    db.add(
        AdminAuditLog(
            action=action,
            model_name=model_name,
            object_pk=str(object_pk),
            object_repr=object_repr[:500],
            changed_data=changed_data or {},
            request_path=str(request.url.path),
            client_host=request.client.host if request.client else "",
            note=f"professor_user_id={professor_id}",
        )
    )
