from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_staff_user, get_db
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.admin import AdminOverviewOut
from app.services.admin_overview import build_admin_overview

router = APIRouter(tags=["Admin"])


@router.get("/overview", response_model=AdminOverviewOut)
@limiter.limit("30/minute")
async def get_admin_overview(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(get_current_staff_user),
):
    del request
    return await build_admin_overview(db)
