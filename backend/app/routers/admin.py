from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_staff_user, get_db, require_staff_permission
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.admin import AdminOverviewOut
from app.schemas.admin_permissions import UserPermissionGrantIn, UserPermissionOut, UserPermissionRevokeIn
from app.schemas.gamification import XPAdjustmentCreateIn, XPAdjustmentOut, XPAdminAuditOut
from app.schemas.reports import (
    CommentModerationActionIn,
    CommentModerationActionOut,
    LiveMessageModerationActionIn,
    LiveMessageModerationActionOut,
    ReportListOut,
    ReportOut,
    ReportUpdateIn,
)
from app.services.admin_permissions import grant_user_permission, list_user_permissions, revoke_user_permission
from app.services.admin_overview import build_admin_overview
from app.services.reports import (
    apply_reported_comment_moderation_action,
    apply_reported_live_message_moderation_action,
    list_admin_content_reports,
    update_admin_content_report,
)
from app.services.xp_adjustments import create_xp_adjustment
from app.services.xp_audit import build_admin_xp_audit

router = APIRouter(tags=["Admin"])
require_roles_manage = require_staff_permission("roles:manage")
require_xp_adjust = require_staff_permission("xp:adjust")
require_audit_read = require_staff_permission("audit:read")
require_reports_manage = require_staff_permission("support:reports")


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


@router.get("/reports", response_model=ReportListOut)
async def list_reports(
    status: str | None = None,
    target_type: str | None = None,
    reason: str | None = None,
    assigned_to_user_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_reports_manage),
):
    return await list_admin_content_reports(
        db,
        status=status,
        target_type=target_type,
        reason=reason,
        assigned_to_user_id=assigned_to_user_id,
        limit=limit,
        offset=offset,
    )


@router.patch("/reports/{report_id}", response_model=ReportOut)
@limiter.limit("20/minute")
async def update_report(
    request: Request,
    report_id: int,
    body: ReportUpdateIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_reports_manage),
):
    return await update_admin_content_report(
        db,
        actor=staff,
        report_id=report_id,
        body=body,
        request_path=str(request.url.path),
        client_host=request.client.host if request.client else "",
    )


@router.post("/reports/{report_id}/comment-moderation", response_model=CommentModerationActionOut)
@limiter.limit("20/minute")
async def moderate_reported_comment(
    request: Request,
    report_id: int,
    body: CommentModerationActionIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_reports_manage),
):
    return await apply_reported_comment_moderation_action(
        db,
        actor=staff,
        report_id=report_id,
        body=body,
        request_path=str(request.url.path),
        client_host=request.client.host if request.client else "",
    )


@router.post("/reports/{report_id}/live-message-moderation", response_model=LiveMessageModerationActionOut)
@limiter.limit("20/minute")
async def moderate_reported_live_message(
    request: Request,
    report_id: int,
    body: LiveMessageModerationActionIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_reports_manage),
):
    return await apply_reported_live_message_moderation_action(
        db,
        actor=staff,
        report_id=report_id,
        body=body,
        request_path=str(request.url.path),
        client_host=request.client.host if request.client else "",
    )
