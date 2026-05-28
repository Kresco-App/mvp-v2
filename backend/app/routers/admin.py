from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_staff_user, get_db
from app.models.users import User
from app.schemas.admin import AdminOverviewOut
from app.services.admin_overview import build_admin_overview

router = APIRouter(tags=["Admin"])


@router.get("/overview", response_model=AdminOverviewOut)
async def get_admin_overview(
    db: AsyncSession = Depends(get_db),
    _staff: User = Depends(get_current_staff_user),
):
    return await build_admin_overview(db)
