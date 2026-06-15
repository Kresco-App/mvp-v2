from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_staff_user, get_db, require_staff_permission
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.admin import AdminOverviewOut
from app.schemas.admin_permissions import UserPermissionGrantIn, UserPermissionOut, UserPermissionRevokeIn
from app.schemas.gamification import XPAdjustmentCreateIn, XPAdjustmentOut, XPAdminAuditOut
from app.services.admin_permissions import grant_user_permission, list_user_permissions, revoke_user_permission
from app.services.admin_overview import build_admin_overview
from app.services.xp_adjustments import create_xp_adjustment
from app.services.xp_audit import build_admin_xp_audit

router = APIRouter(tags=["Admin"])
require_roles_manage = require_staff_permission("roles:manage")
require_xp_adjust = require_staff_permission("xp:adjust")
require_audit_read = require_staff_permission("audit:read")


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


@router.post("/xp-adjustments", response_model=XPAdjustmentOut)
@limiter.limit("10/minute")
async def create_admin_xp_adjustment(
    request: Request,
    adjustment: XPAdjustmentCreateIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_xp_adjust),
):
    request_path = str(request.url.path)
    client_host = request.client.host if request.client else ""
    return await create_xp_adjustment(
        db,
        actor=staff,
        request=adjustment,
        request_path=request_path,
        client_host=client_host,
    )


@router.get("/xp-audit", response_model=XPAdminAuditOut)
async def get_admin_xp_audit(
    user_id: int,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_audit_read),
):
    return await build_admin_xp_audit(db, user_id=user_id, limit=limit)
