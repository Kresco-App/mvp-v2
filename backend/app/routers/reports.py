from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.reports import ReportCreateIn, ReportOut
from app.services.reports import create_content_report

router = APIRouter(tags=["Reports"])


@router.post("/reports", response_model=ReportOut)
@limiter.limit("20/minute")
async def create_report(
    request: Request,
    body: ReportCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    del request
    return await create_content_report(db, reporter=user, body=body)
