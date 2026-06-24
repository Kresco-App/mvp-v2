from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_staff_permission
from app.models.users import User
from app.schemas.founder_ops import StaffPaymentDashboardOut, StaffPaymentRequestCreateIn, StaffPaymentRequestOut
from app.services.staff_payments import build_staff_payment_dashboard, create_staff_payment_request

router = APIRouter(tags=["Staff"])

require_staff_codes = require_staff_permission("finance:staff_codes")


@router.get("/payments/dashboard", response_model=StaffPaymentDashboardOut)
async def get_staff_payment_dashboard(
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff_codes),
):
    return await build_staff_payment_dashboard(db, staff=staff, limit=limit)


@router.post("/payments/requests", response_model=StaffPaymentRequestOut)
async def create_staff_payment_code(
    request: StaffPaymentRequestCreateIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff_codes),
):
    return await create_staff_payment_request(db, staff=staff, payload=request)
