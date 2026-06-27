from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_staff_permission
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.admin import (
    AdminActivityOut,
    AdminCommunicationsOut,
    AdminOverviewOut,
    AdminStudentAccountCreateIn,
    AdminStudentAccountUpdateIn,
    AdminStudentProgressOut,
    AdminUserAccessRowOut,
    AdminUsersAccessOut,
    AdminVideoFeedbackOut,
)
from app.schemas.founder_ops import (
    FinanceExpenseIn,
    FinanceExpenseOut,
    FounderDashboardOut,
    RedemptionCodeTemplateIn,
    RedemptionCodeTemplateOut,
    StaffPaymentProfileOut,
    StaffPaymentProfileUpdateIn,
    StaffPaymentRequestOut,
)
from app.schemas.admin_permissions import UserPermissionGrantIn, UserPermissionOut, UserPermissionRevokeIn
from app.schemas.professor import (
    AdminChangeRequestListItemOut,
    AdminReviewIn,
    ProfessorChangeRequestDetailOut,
)
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
from app.services.admin_activity import build_admin_activity
from app.services.admin_permissions import grant_user_permission, list_user_permissions, revoke_user_permission
from app.services.admin_communications import build_admin_communications, record_admin_communications_read
from app.services.admin_overview import build_admin_overview
from app.services.admin_student_progress import build_admin_student_progress
from app.services.admin_users import build_admin_users_access, create_admin_student_account, update_admin_student_account
from app.services.admin_video_feedback import build_admin_video_feedback
from app.services.founder_ops import build_founder_dashboard, create_finance_expense, list_finance_expenses
from app.services.staff_payments import (
    create_redemption_template,
    list_redemption_templates,
    list_staff_payment_profiles,
    list_staff_payment_requests,
    upsert_staff_payment_profile,
)
from app.services.admin_change_requests import (
    get_admin_change_request_detail,
    list_admin_change_requests,
    review_admin_change_request,
)
from app.services.reports import (
    apply_reported_comment_moderation_action,
    apply_reported_live_message_moderation_action,
    list_admin_content_reports,
    update_admin_content_report,
)
from app.services.xp_adjustments import create_xp_adjustment
from app.services.xp_audit import build_admin_xp_audit

router = APIRouter(tags=["Admin"])
require_admin_overview_read = require_staff_permission("admin:overview_read")
require_roles_manage = require_staff_permission("roles:manage")
require_xp_adjust = require_staff_permission("xp:adjust")
require_audit_read = require_staff_permission("audit:read")
require_reports_manage = require_staff_permission("support:reports")
require_finance_read = require_staff_permission("finance:read")
require_finance_expense_manage = require_staff_permission("finance:expense_manage")
require_staff_codes_admin = require_staff_permission("finance:staff_codes")
require_students_progress_read = require_staff_permission("students:progress_read")
require_communications_read = require_staff_permission("communications:read")
require_users_read = require_staff_permission("users:read")
require_users_update = require_staff_permission("users:update")
require_change_requests_read = require_staff_permission("content:change_read")
require_change_requests_review = require_staff_permission("content:change_review")
ADMIN_FINANCE_MUTATION_RATE_LIMIT = "10/minute"
ADMIN_ACCOUNT_MUTATION_RATE_LIMIT = "20/minute"


@router.get("/overview", response_model=AdminOverviewOut)
@limiter.limit("30/minute")
async def get_admin_overview(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_admin_overview_read),
):
    del request
    return await build_admin_overview(db)


@router.get("/founder-dashboard", response_model=FounderDashboardOut)
async def get_founder_dashboard(
    month: str | None = None,
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_finance_read),
):
    parsed_month = _parse_month(month)
    return await build_founder_dashboard(db, month=parsed_month)


@router.get("/finance/expenses", response_model=list[FinanceExpenseOut])
async def get_finance_expenses(
    month: str | None = None,
    limit: int = Query(default=100, ge=1, le=300),
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_finance_read),
):
    parsed_month = _parse_month(month)
    return await list_finance_expenses(db, month=parsed_month, limit=limit)


@router.post("/finance/expenses", response_model=FinanceExpenseOut)
@limiter.limit(ADMIN_FINANCE_MUTATION_RATE_LIMIT)
async def create_admin_finance_expense(
    request: Request,
    expense: FinanceExpenseIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_finance_expense_manage),
):
    del request
    return await create_finance_expense(db, actor=staff, payload=expense)


@router.get("/redemption-templates", response_model=list[RedemptionCodeTemplateOut])
async def get_redemption_templates(
    include_archived: bool = False,
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_staff_codes_admin),
):
    return await list_redemption_templates(db, include_archived=include_archived)


@router.post("/redemption-templates", response_model=RedemptionCodeTemplateOut)
@limiter.limit(ADMIN_FINANCE_MUTATION_RATE_LIMIT)
async def create_admin_redemption_template(
    request: Request,
    template: RedemptionCodeTemplateIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff_codes_admin),
):
    del request
    return await create_redemption_template(db, actor=staff, payload=template)


@router.get("/staff-payment-requests", response_model=list[StaffPaymentRequestOut])
async def get_staff_payment_requests(
    staff_user_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_staff_codes_admin),
):
    return await list_staff_payment_requests(db, staff_user_id=staff_user_id, limit=limit)


@router.get("/staff-payment-profiles", response_model=list[StaffPaymentProfileOut])
async def get_staff_payment_profiles(
    limit: int = Query(default=100, ge=1, le=300),
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_staff_codes_admin),
):
    return await list_staff_payment_profiles(db, limit=limit)


@router.put("/staff-payment-profiles/{user_id}", response_model=StaffPaymentProfileOut)
@limiter.limit(ADMIN_FINANCE_MUTATION_RATE_LIMIT)
async def put_staff_payment_profile(
    request: Request,
    user_id: int,
    profile: StaffPaymentProfileUpdateIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff_codes_admin),
):
    del request
    return await upsert_staff_payment_profile(db, actor=staff, user_id=user_id, payload=profile)


@router.get("/activity", response_model=AdminActivityOut)
async def get_admin_activity(
    limit: int = Query(default=80, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_audit_read),
):
    return await build_admin_activity(db, limit=limit)


@router.get("/student-progress", response_model=AdminStudentProgressOut)
async def get_admin_student_progress(
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_students_progress_read),
):
    return await build_admin_student_progress(db, limit=limit)


@router.get("/communications", response_model=AdminCommunicationsOut)
@limiter.limit("30/minute")
async def get_admin_communications(
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),
    q: str | None = Query(default=None, max_length=80),
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_communications_read),
):
    response = await build_admin_communications(db, limit=limit, search=q)
    record_admin_communications_read(db, staff=staff, request=request, response=response, limit=limit)
    await db.commit()
    return response


@router.get("/video-feedback", response_model=AdminVideoFeedbackOut)
async def get_admin_video_feedback(
    limit: int = Query(default=80, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_change_requests_read),
):
    return await build_admin_video_feedback(db, limit=limit)


@router.get("/users-access", response_model=AdminUsersAccessOut)
async def get_admin_users_access(
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_users_read),
):
    return await build_admin_users_access(db, limit=limit)


@router.post("/users-access/students", response_model=AdminUserAccessRowOut, status_code=201)
@limiter.limit(ADMIN_ACCOUNT_MUTATION_RATE_LIMIT)
async def create_admin_student_account_route(
    request: Request,
    body: AdminStudentAccountCreateIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_users_update),
):
    return await create_admin_student_account(
        db,
        actor=staff,
        payload=body,
        request_path=str(request.url.path),
        client_host=request.client.host if request.client else "",
    )


@router.patch("/users-access/students/{user_id}", response_model=AdminUserAccessRowOut)
@limiter.limit(ADMIN_ACCOUNT_MUTATION_RATE_LIMIT)
async def patch_admin_student_account(
    request: Request,
    user_id: int,
    body: AdminStudentAccountUpdateIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_users_update),
):
    return await update_admin_student_account(
        db,
        actor=staff,
        user_id=user_id,
        payload=body,
        request_path=str(request.url.path),
        client_host=request.client.host if request.client else "",
    )


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


@router.get("/change-requests", response_model=list[AdminChangeRequestListItemOut])
async def list_professor_change_requests_admin(
    status: str = "pending",
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_change_requests_read),
):
    return await list_admin_change_requests(db, status=status, limit=limit, offset=offset)


@router.get("/change-requests/{change_request_id}", response_model=ProfessorChangeRequestDetailOut)
async def get_professor_change_request_admin(
    change_request_id: int,
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(require_change_requests_read),
):
    return await get_admin_change_request_detail(db, change_request_id)


@router.post("/change-requests/{change_request_id}/review", response_model=ProfessorChangeRequestDetailOut)
@limiter.limit("30/minute")
async def review_professor_change_request_admin(
    request: Request,
    change_request_id: int,
    body: AdminReviewIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_change_requests_review),
):
    del request
    return await review_admin_change_request(
        db,
        change_request_id=change_request_id,
        body=body,
        admin_user=staff,
    )


def _parse_month(value: str | None) -> date | None:
    if not value:
        return None
    try:
        year_text, month_text, *_ = f"{value}-01".split("-")
        return date(int(year_text), int(month_text), 1)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="month must use YYYY-MM format") from exc
