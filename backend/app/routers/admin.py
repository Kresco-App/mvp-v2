from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_staff_user, get_db, require_staff_permission
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.admin import AdminOverviewOut
from app.schemas.admin_permissions import UserPermissionGrantIn, UserPermissionOut, UserPermissionRevokeIn
from app.services.admin_permissions import grant_user_permission, list_user_permissions, revoke_user_permission
from app.services.admin_overview import build_admin_overview

router = APIRouter(tags=["Admin"])
require_roles_manage = require_staff_permission("roles:manage")


@router.get("/overview", response_model=AdminOverviewOut)
@limiter.limit("30/minute")
async def get_admin_overview(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(get_current_staff_user),
):
    del request
    return await build_admin_overview(db)


@router.get("/permissions", response_model=list[UserPermissionOut])
async def list_permissions(
    user_id: int | None = None,
    status: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_roles_manage),
):
    return await list_user_permissions(db, user_id=user_id, status=status, limit=limit)


@router.post("/permissions", response_model=UserPermissionOut)
@limiter.limit("20/minute")
async def grant_permission(
    request: Request,
    grant: UserPermissionGrantIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_roles_manage),
):
    request_path = str(request.url.path)
    client_host = request.client.host if request.client else ""
    return await grant_user_permission(
        db,
        actor=staff,
        user_id=grant.user_id,
        permission=grant.permission,
        reason=grant.reason,
        request_path=request_path,
        client_host=client_host,
    )


@router.post("/permissions/{permission_id}/revoke", response_model=UserPermissionOut)
@limiter.limit("20/minute")
async def revoke_permission(
    request: Request,
    permission_id: int,
    body: UserPermissionRevokeIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_roles_manage),
):
    request_path = str(request.url.path)
    client_host = request.client.host if request.client else ""
    return await revoke_user_permission(
        db,
        actor=staff,
        permission_id=permission_id,
        reason=body.reason,
        request_path=request_path,
        client_host=client_host,
    )
