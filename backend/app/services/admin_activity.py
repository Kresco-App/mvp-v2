from datetime import datetime, timedelta, timezone
import re
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_audit import AdminAuditLog
from app.schemas.admin import AdminActivityEntryOut, AdminActivityOut, AdminActivitySummaryOut

_ACTOR_NOTE_RE = re.compile(r"(?:admin_user_id|actor_user_id|professor_user_id)=(\d+)")


def _int(value: Any) -> int:
    return int(value or 0)


def _changed_data(log: AdminAuditLog) -> dict[str, Any]:
    value = log.changed_data
    return value if isinstance(value, dict) else {}


def _actor_user_id(log: AdminAuditLog) -> int | None:
    data = _changed_data(log)
    for key in ("actor_user_id", "admin_user_id", "professor_user_id"):
        value = data.get(key)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)

    match = _ACTOR_NOTE_RE.search(log.note or "")
    return int(match.group(1)) if match else None


def _summary(log: AdminAuditLog) -> str:
    data = _changed_data(log)
    target = log.object_repr or f"{log.model_name} {log.object_pk}".strip()
    detail = (
        data.get("reason")
        or data.get("resolution_note")
        or data.get("permission")
        or data.get("status")
        or data.get("operation_count")
    )
    if detail is None:
        return target
    return f"{target}: {detail}"[:240]


async def _count(db: AsyncSession, *filters: Any) -> int:
    statement = select(func.count()).select_from(AdminAuditLog)
    if filters:
        statement = statement.where(*filters)
    return _int(await db.scalar(statement))


async def _breakdown(db: AsyncSession, column: Any, *, limit: int = 8) -> dict[str, int]:
    result = await db.execute(
        select(column, func.count())
        .select_from(AdminAuditLog)
        .group_by(column)
        .order_by(func.count().desc(), column.asc())
        .limit(limit)
    )
    return {str(key or "unset"): _int(value) for key, value in result.all()}


async def build_admin_activity(db: AsyncSession, *, limit: int = 80) -> AdminActivityOut:
    now = datetime.now(timezone.utc)
    bounded_limit = max(1, min(int(limit or 80), 200))

    result = await db.execute(
        select(AdminAuditLog)
        .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
        .limit(bounded_limit)
    )
    logs = list(result.scalars().all())
    entries = [
        AdminActivityEntryOut(
            id=int(log.id),
            action=log.action or "",
            model_name=log.model_name or "",
            object_pk=log.object_pk or "",
            object_repr=log.object_repr or "",
            summary=_summary(log),
            actor_user_id=_actor_user_id(log),
            request_path=log.request_path or "",
            client_host=log.client_host or "",
            changed_keys=sorted(str(key) for key in _changed_data(log).keys())[:12],
            changed_data=_changed_data(log),
            created_at=log.created_at,
        )
        for log in logs
    ]
    actors = {entry.actor_user_id for entry in entries if entry.actor_user_id is not None}
    models = {entry.model_name for entry in entries if entry.model_name}

    return AdminActivityOut(
        generated_at=now,
        summary=AdminActivitySummaryOut(
            total_audit_rows=await _count(db),
            created_24h=await _count(db, AdminAuditLog.created_at >= now - timedelta(days=1)),
            created_7d=await _count(db, AdminAuditLog.created_at >= now - timedelta(days=7)),
            actors_in_feed=len(actors),
            models_in_feed=len(models),
        ),
        by_action=await _breakdown(db, AdminAuditLog.action),
        by_model=await _breakdown(db, AdminAuditLog.model_name),
        entries=entries,
    )
