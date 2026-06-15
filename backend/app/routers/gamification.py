from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db
from app.models.users import User
from app.rate_limit import limiter
from app.schemas.gamification import (
    DailyQuestOut, UserStatsOut, XPOut, XPTransactionOut,
    LeaderboardEntryOut, MistakeNotebookListOut, SidebarSummaryOut,
)
from app.services.gamification_read_models import (
    build_sidebar_summary,
    build_xp_summary,
    claim_daily_quest_reward,
    build_user_stats,
    list_daily_quest_entries,
    list_leaderboard_entries,
    list_xp_transactions,
)
from app.services.mistake_notebook import list_mistake_notebook_entries

router = APIRouter(tags=["Progress & Gamification"])


@router.get("/xp", response_model=XPOut)
async def get_xp(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await build_xp_summary(db, user=user)


@router.get("/xp/history", response_model=list[XPTransactionOut])
async def get_xp_history(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_xp_transactions(db, user=user, limit=limit, offset=offset)


@router.get("/leaderboard", response_model=list[LeaderboardEntryOut])
async def get_leaderboard(
    limit: int = 50,
    offset: int = 0,
    search: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return await list_leaderboard_entries(
        db,
        user=user,
        settings=settings,
        limit=limit,
        offset=offset,
        search=search,
    )


@router.get("/daily-quests", response_model=list[DailyQuestOut])
async def get_daily_quests(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_daily_quest_entries(db, user=user)


@router.get("/sidebar-summary", response_model=SidebarSummaryOut)
async def get_sidebar_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return await build_sidebar_summary(db, user=user, settings=settings)


@router.get("/mistakes", response_model=MistakeNotebookListOut)
async def get_mistake_notebook(
    status: str | None = Query(default=None, pattern="^(open|corrected)$"),
    subject_id: int | None = Query(default=None, ge=1),
    topic_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_mistake_notebook_entries(
        db,
        user=user,
        status=status,
        subject_id=subject_id,
        topic_id=topic_id,
        limit=limit,
        offset=offset,
    )

@router.post("/daily-quests/{quest_id}/claim")
@limiter.limit("10/minute")
async def claim_daily_quest(
    request: Request,
    quest_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await claim_daily_quest_reward(db, user=user, quest_id=quest_id)


@router.get("/stats", response_model=UserStatsOut)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await build_user_stats(db, user=user)

