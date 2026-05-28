from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_current_user, get_db
from app.models.users import User
from app.schemas.gamification import (
    DailyQuestOut, LessonAccessOut, LessonProgressOut, SectionAccessOut,
    SectionCompleteIn, SubjectPlanOut, UserStatsOut, XPOut, XPTransactionOut,
    ProgressUpdateIn, ProgressCompleteIn, LeaderboardEntryOut, SidebarSummaryOut,
)
from app.schemas.courses import VideoQuizTriggerOut
from app.schemas.quizzes import QuizResultOut, QuizSubmitIn
from app.services.gamification_quiz_results import record_legacy_quiz_result
from app.services.gamification_read_models import (
    build_lesson_access_status,
    build_section_access_status,
    build_sidebar_summary,
    build_subject_plan,
    build_xp_summary,
    claim_daily_quest_reward,
    build_user_stats,
    list_daily_quest_entries,
    list_leaderboard_entries,
    list_lesson_quiz_triggers,
    list_xp_transactions,
)
from app.services.gamification_progress import (
    complete_chapter_section,
    mark_content_complete,
    update_lesson_progress,
)

router = APIRouter(tags=["Progress & Gamification"])

@router.get("/subject-plan/{subject_id}", response_model=SubjectPlanOut)
async def get_subject_plan(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    subject_plan = await build_subject_plan(db, user_id=user.id, subject_id=subject_id)
    if subject_plan is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject_plan


@router.post("/update", response_model=LessonProgressOut)
async def update_progress(
    body: ProgressUpdateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await update_lesson_progress(db, user=user, body=body)


@router.post("/complete")
async def mark_complete(
    body: ProgressCompleteIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await mark_content_complete(db, user=user, body=body)


@router.get("/lessons/{lesson_id}/access", response_model=LessonAccessOut)
async def check_lesson_access(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await build_lesson_access_status(db, user=user, lesson_id=lesson_id)


@router.post("/section-complete")
async def complete_section(
    body: SectionCompleteIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await complete_chapter_section(db, user=user, body=body)


@router.get("/sections/{section_id}/access", response_model=SectionAccessOut)
async def check_section_access(
    section_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await build_section_access_status(db, user=user, section_id=section_id)


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


@router.get("/lessons/{lesson_id}/quiz-triggers", response_model=list[VideoQuizTriggerOut])
async def get_quiz_triggers(
    lesson_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await list_lesson_quiz_triggers(db, user=user, lesson_id=lesson_id, limit=limit, offset=offset)


@router.post("/quiz-result", response_model=QuizResultOut)
async def record_quiz_result(
    quiz_id: int,
    body: QuizSubmitIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await record_legacy_quiz_result(db, user=user, quiz_id=quiz_id, body=body)


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


@router.post("/daily-quests/{quest_id}/claim")
async def claim_daily_quest(
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
