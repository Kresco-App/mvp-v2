from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_audit import AdminAuditLog
from app.models.users import User, UserPermission
from app.schemas.admin_permissions import UserPermissionOut

ALLOWED_USER_PERMISSIONS = {
    "admin:overview_read",
    "audit:read",
    "communications:read",
    "content:change_read",
    "content:change_review",
    "content:write",
    "finance:export",
    "finance:expense_manage",
    "finance:manual_grant",
    "finance:payment_review",
    "finance:read",
    "finance:refund",
    "finance:staff_codes",
    "live:moderate",
    "roles:manage",
    "sqladmin:access",
    "students:progress_read",
    "support:reports",
    "users:read",
    "users:update",
    "xp:adjust",
}


async def list_user_permissions(
    db: AsyncSession,
    *,
    user_id: int | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[UserPermissionOut]:
    statement = select(UserPermission).order_by(UserPermission.created_at.desc(), UserPermission.id.desc())
    if user_id is not None:
        statement = statement.where(UserPermission.user_id == int(user_id))
    if status:
        normalized_status = _normalize_status(status)
        statement = statement.where(UserPermission.status == normalized_status)
    result = await db.execute(statement.limit(max(1, min(int(limit), 200))))
    return [user_permission_out(permission) for permission in result.scalars().all()]


async def grant_user_permission(
    db: AsyncSession,
    *,
    actor: User,
    user_id: int,
    permission: str,
    reason: str,
    request_path: str = "",
    client_host: str = "",
) -> UserPermissionOut:
    actor_id = int(actor.id)
    target_user_id = int(user_id)
    if target_user_id == actor_id:
        raise HTTPException(status_code=400, detail="Cannot grant permissions to yourself")
    normalized_permission = _normalize_permission(permission)
    target = await db.get(User, target_user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not (target.is_staff and target.is_active and target.is_email_verified):
        raise HTTPException(status_code=400, detail="Permissions can only be granted to active verified staff")

    existing = await _load_user_permission(db, user_id=target_user_id, permission=normalized_permission)
    if existing is None:
        existing = UserPermission(
            user_id=target_user_id,
            permission=normalized_permission,
            status="active",
            reason=reason,
            granted_by_user_id=actor_id,
        )
        db.add(existing)
        action = "permission_grant"
    else:
        previous_status = existing.status
        existing.status = "active"
        existing.reason = reason
        existing.granted_by_user_id = actor_id
        existing.revoked_at = None
        action = "permission_restore" if previous_status == "revoked" else "permission_grant"
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        existing = await _load_user_permission(db, user_id=target_user_id, permission=normalized_permission)
        if existing is None:
            raise
        existing.status = "active"
        existing.reason = reason
        existing.granted_by_user_id = actor_id
        existing.revoked_at = None
        action = "permission_restore"
        await db.flush()
    _add_permission_audit(
        db,
        action=action,
        permission=existing,
        actor_id=actor_id,
        reason=reason,
        request_path=request_path,
        client_host=client_host,
    )
    await db.commit()
    await db.refresh(existing)
    return user_permission_out(existing)


async def revoke_user_permission(
    db: AsyncSession,
    *,
    actor: User,
    permission_id: int,
    reason: str,
    request_path: str = "",
    client_host: str = "",
) -> UserPermissionOut:
    actor_id = int(actor.id)
    permission = await db.get(UserPermission, int(permission_id))
    if permission is None:
        raise HTTPException(status_code=404, detail="Permission grant not found")
    if permission.user_id == actor_id and permission.permission == "roles:manage":
        raise HTTPException(status_code=400, detail="Cannot revoke your own roles:manage permission")
    if permission.status == "revoked":
        _add_permission_audit(
            db,
            action="permission_noop",
            permission=permission,
            actor_id=actor_id,
            reason=reason,
            request_path=request_path,
            client_host=client_host,
        )
        await db.commit()
        return user_permission_out(permission)

    permission.status = "revoked"
    permission.reason = reason
    permission.revoked_at = datetime.now(timezone.utc)
    _add_permission_audit(
        db,
        action="permission_revoke",
        permission=permission,
        actor_id=actor_id,
        reason=reason,
        request_path=request_path,
        client_host=client_host,
    )
    await db.commit()
    await db.refresh(permission)
    return user_permission_out(permission)


async def _load_user_permission(db: AsyncSession, *, user_id: int, permission: str) -> UserPermission | None:
    result = await db.execute(
        select(UserPermission)
        .where(
            UserPermission.user_id == user_id,
            UserPermission.permission == permission,
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


def _normalize_permission(permission: str) -> str:
    normalized = permission.strip().lower()
    if normalized not in ALLOWED_USER_PERMISSIONS:
        raise HTTPException(status_code=400, detail="Unsupported permission")
    return normalized


def _normalize_status(status: str) -> str:
    normalized = status.strip().lower()
    if normalized not in {"active", "revoked"}:
        raise HTTPException(status_code=400, detail="Unsupported permission status")
    return normalized


def _add_permission_audit(
    db: AsyncSession,
    *,
    action: str,
    permission: UserPermission,
    actor_id: int,
    reason: str,
    request_path: str,
    client_host: str,
) -> None:
    db.add(
        AdminAuditLog(
            action=action,
            model_name="UserPermission",
            object_pk=str(permission.id),
            object_repr=f"{permission.user_id}:{permission.permission}"[:500],
            changed_data={
                "user_id": int(permission.user_id),
                "permission": permission.permission,
                "status": permission.status,
                "reason": reason,
                "actor_user_id": actor_id,
            },
            request_path=request_path,
            client_host=client_host,
            note=f"admin_user_id={actor_id}",
        )
    )


def user_permission_out(permission: UserPermission) -> UserPermissionOut:
    return UserPermissionOut(
        id=int(permission.id),
        user_id=int(permission.user_id),
        permission=permission.permission,
        status=permission.status,
        reason=permission.reason,
        granted_by_user_id=int(permission.granted_by_user_id) if permission.granted_by_user_id is not None else None,
        created_at=permission.created_at,
        revoked_at=permission.revoked_at,
    )
